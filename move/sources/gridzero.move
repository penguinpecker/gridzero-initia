/// gridZERO initia - the 5x5 onchain round game, ported from GridZeroV4 (Base L2)
/// to Initia mainnet (interwoven-1) as a native MoveVM module.
///
/// Game logic is identical to the live Base contract:
///   * 5x5 grid (25 cells), players pick one cell per round for a fixed entry fee.
///   * Rounds last `round_duration` seconds, anchored to L1 block time.
///   * On resolve, a winning cell is chosen FROM OCCUPIED CELLS ONLY (so there is
///     always a winner when at least one player joined), winners auto-paid in the
///     same transaction (no claim step), plus minted $ZERO.
///   * ~1-in-`bonus_round_odds` rounds are "Motherlode" rounds (bonus payout).
///
/// What changed from Base: the entry/pot/payout currency is native INIT (uinit)
/// instead of USDC, and the ZK-VRF (Groth16 + zkVerify) is removed. Randomness is
/// still supplied by the off-chain resolver/fulfiller exactly as before, but the
/// winning cell is derived on-chain with the native `keccak` module using the same
/// `keccak256(vrf) % cells` formula - no trust change vs. the original (the
/// fulfiller already submitted the VRF output; ZK was only an audit trail).
module gridzero::game {
    use std::signer;
    use std::string;
    use std::vector;
    use std::error;
    use minitia_std::block;
    use minitia_std::coin;
    use minitia_std::event;
    use minitia_std::keccak;
    use minitia_std::fungible_asset::{Metadata};
    use minitia_std::object::{Self, Object, ExtendRef};
    use minitia_std::table::{Self, Table};
    use gridzero::zero_token;

    // ----- errors -----
    const ENOT_ADMIN: u64 = 1;
    const ENOT_FULFILLER: u64 = 2;
    const EBAD_CELL: u64 = 3;
    const EROUND_OVER: u64 = 4;
    const EALREADY_JOINED: u64 = 5;
    const EWRONG_ROUND: u64 = 6;
    const EROUND_NOT_OVER: u64 = 7;
    const EALREADY_RESOLVED: u64 = 8;
    const ENO_PLAYERS: u64 = 9;
    const EHAS_PLAYERS: u64 = 10;
    const EBAD_CONFIG: u64 = 11;

    // ----- constants -----
    const GRID_CELLS: u64 = 25;          // 5x5
    const BPS_BASE: u64 = 10_000;
    const INIT_DENOM: vector<u8> = b"uinit"; // native INIT (6 decimals)
    const NO_CELL: u8 = 255;             // sentinel: not yet decided / not joined

    // ----- storage -----

    /// A single round. Stored inside `Game.rounds`.
    struct Round has store {
        start_time: u64,
        end_time: u64,
        total_deposits: u64,   // sum of entry fees (uinit)
        total_players: u64,
        winning_cell: u8,      // 0..24 once resolved, else NO_CELL
        resolved: bool,
        is_bonus_round: bool,
        init_per_winner: u64,  // recorded payout for transparency
        zero_per_winner: u64,
        cells: vector<vector<address>>, // length 25; cells[i] = players who picked i
        picks: Table<address, u8>,      // player -> cell (presence == joined this round)
    }

    /// Global game state, held at @gridzero.
    struct Game has key {
        admin: address,
        fulfiller: address,    // the resolver bot, the only one who may resolve
        fee_recipient: address,
        entry_fee: u64,        // uinit
        round_duration: u64,   // seconds
        protocol_fee_bps: u64, // e.g. 500 = 5%
        resolver_reward: u64,  // uinit paid to fulfiller per resolution
        zero_per_round: u64,   // $ZERO (base units) split among winners
        motherlode_per_round: u64,
        bonus_round_odds: u64, // 1-in-N
        bonus_multiplier: u64, // INIT payout multiplier on bonus rounds
        current_round_id: u64,
        accumulated_fees: u64, // uinit held in escrow, withdrawable by admin
        escrow_ext: ExtendRef, // signer source for the INIT pot custody object
        rounds: Table<u64, Round>,
    }

    // ----- events -----
    #[event] struct RoundStarted has drop, store { round_id: u64, start_time: u64, end_time: u64 }
    #[event] struct CellPicked has drop, store { round_id: u64, player: address, cell: u8 }
    #[event] struct RoundResolved has drop, store { round_id: u64, winning_cell: u8, winners_count: u64, is_bonus_round: bool }
    #[event] struct WinningsPaid has drop, store { round_id: u64, player: address, init_amount: u64, zero_amount: u64 }
    #[event] struct EmptyRoundSkipped has drop, store { round_id: u64 }
    #[event] struct ConfigUpdated has drop, store { key: string::String, value: u64 }

    // ----- init -----

    /// Runs automatically on publish under @gridzero. Creates the escrow object,
    /// seeds default config (mirrors the live V4 settings), and opens round #1.
    fun init_module(deployer: &signer) {
        let cref = object::create_named_object(deployer, b"gridzero_escrow");
        let escrow_ext = object::generate_extend_ref(&cref);
        let admin = signer::address_of(deployer);
        let game = Game {
            admin,
            fulfiller: admin,
            fee_recipient: admin,
            entry_fee: 1_000_000,          // 1 INIT
            round_duration: 60,            // seconds (matches live V4 frontend)
            protocol_fee_bps: 500,         // 5%
            resolver_reward: 100_000,      // 0.1 INIT
            zero_per_round: 100_000_000,   // 100 ZERO (6 decimals)
            motherlode_per_round: 1_000_000_000, // 1000 ZERO
            bonus_round_odds: 100,         // 1 in 100
            bonus_multiplier: 10,          // 10x INIT pot on bonus rounds
            current_round_id: 0,
            accumulated_fees: 0,
            escrow_ext,
            rounds: table::new<u64, Round>(),
        };
        let game = game;
        start_new_round(&mut game);
        move_to(deployer, game);
    }

    // ----- player actions -----

    /// Enter the current round: pay `entry_fee` INIT and pick a cell (0..24).
    public entry fun pick_cell(player: &signer, cell: u8) acquires Game {
        assert!((cell as u64) < GRID_CELLS, error::invalid_argument(EBAD_CELL));
        let game = borrow_global_mut<Game>(@gridzero);
        let rid = game.current_round_id;
        let entry_fee = game.entry_fee;
        let escrow = escrow_address(game);
        let paddr = signer::address_of(player);
        let now = block::get_current_block_timestamp();
        {
            let r = table::borrow_mut(&mut game.rounds, rid);
            assert!(!r.resolved, error::invalid_state(EALREADY_RESOLVED));
            assert!(now < r.end_time, error::invalid_state(EROUND_OVER));
            assert!(!table::contains(&r.picks, paddr), error::invalid_state(EALREADY_JOINED));
        };
        // collect the entry fee into the escrow pot
        let fa = coin::withdraw(player, init_metadata(), entry_fee);
        coin::deposit(escrow, fa);
        // record the pick
        let r = table::borrow_mut(&mut game.rounds, rid);
        let bucket = vector::borrow_mut(&mut r.cells, (cell as u64));
        vector::push_back(bucket, paddr);
        table::add(&mut r.picks, paddr, cell);
        r.total_players = r.total_players + 1;
        r.total_deposits = r.total_deposits + entry_fee;
        event::emit(CellPicked { round_id: rid, player: paddr, cell });
    }

    // ----- fulfiller (resolver bot) actions -----

    /// Resolve a finished round. Picks the winning cell from occupied cells using
    /// `vrf` (random bytes supplied by the fulfiller), auto-pays winners in INIT,
    /// mints $ZERO, pays the resolver reward, banks the protocol fee, opens the
    /// next round.
    public entry fun resolve_round(fulfiller: &signer, round_id: u64, vrf: vector<u8>) acquires Game {
        let game = borrow_global_mut<Game>(@gridzero);
        assert!(signer::address_of(fulfiller) == game.fulfiller, error::permission_denied(ENOT_FULFILLER));
        assert!(round_id == game.current_round_id, error::invalid_argument(EWRONG_ROUND));
        let now = block::get_current_block_timestamp();

        // snapshot config (avoids holding a borrow of `game` across mutations)
        let fee_bps = game.protocol_fee_bps;
        let resolver_reward = game.resolver_reward;
        let zero_per_round = game.zero_per_round;
        let motherlode = game.motherlode_per_round;
        let odds = game.bonus_round_odds;
        let multiplier = game.bonus_multiplier;
        let acc_fees = game.accumulated_fees;
        let escrow = escrow_address(game);
        let init_meta = init_metadata();
        let fulfiller_addr = signer::address_of(fulfiller);

        // validate + read the round
        let pool;
        let winning_cell;
        let winners;
        {
            let r = table::borrow(&game.rounds, round_id);
            assert!(!r.resolved, error::invalid_state(EALREADY_RESOLVED));
            assert!(now >= r.end_time, error::invalid_state(EROUND_NOT_OVER));
            assert!(r.total_players > 0, error::invalid_state(ENO_PLAYERS));
            let (wc, ws) = pick_winner(&r.cells, &vrf);
            winning_cell = wc;
            winners = ws;
            pool = r.total_deposits;
        };
        let is_bonus = compute_bonus(&vrf, odds);
        let winners_count = vector::length(&winners);

        // payout math (V4 semantics; hardened). Checked subtraction: a round can
        // never abort/lock funds if the pool can't cover fee + resolver reward.
        let fee = pool * fee_bps / BPS_BASE;
        let distributable =
            if (pool > fee + resolver_reward) { pool - fee - resolver_reward } else { 0 };
        if (is_bonus) {
            // u128 intermediates so `distributable * multiplier` can never overflow.
            let bonus_amt = (distributable as u128) * (multiplier as u128);
            let escrow_bal = coin::balance(escrow, init_meta);
            let reserved = acc_fees + fee + resolver_reward;
            let available =
                if (escrow_bal > reserved) { ((escrow_bal - reserved) as u128) } else { 0u128 };
            let capped = if (bonus_amt > available) { available } else { bonus_amt };
            distributable = (capped as u64);
        };
        let (init_per_winner, init_dust) = payout_split(distributable, winners_count);
        let zero_total = if (is_bonus) { motherlode } else { zero_per_round };
        let zero_per_winner = zero_total / winners_count;

        // pay every winner from the escrow, in the same tx (no claim step)
        let escrow_signer = object::generate_signer_for_extending(&game.escrow_ext);
        let i = 0;
        while (i < winners_count) {
            let w = *vector::borrow(&winners, i);
            if (init_per_winner > 0) {
                let fa = coin::withdraw(&escrow_signer, init_meta, init_per_winner);
                coin::deposit(w, fa);
            };
            if (zero_per_winner > 0) {
                let zfa = zero_token::mint(zero_per_winner);
                coin::deposit(w, zfa);
            };
            event::emit(WinningsPaid { round_id, player: w, init_amount: init_per_winner, zero_amount: zero_per_winner });
            i = i + 1;
        };

        // resolver reward
        if (resolver_reward > 0) {
            let fa = coin::withdraw(&escrow_signer, init_meta, resolver_reward);
            coin::deposit(fulfiller_addr, fa);
        };
        // route division dust to protocol fees so no INIT is stranded in escrow
        game.accumulated_fees = acc_fees + fee + init_dust;

        // finalize the round record
        {
            let r = table::borrow_mut(&mut game.rounds, round_id);
            r.winning_cell = winning_cell;
            r.resolved = true;
            r.is_bonus_round = is_bonus;
            r.init_per_winner = init_per_winner;
            r.zero_per_winner = zero_per_winner;
        };
        event::emit(RoundResolved { round_id, winning_cell, winners_count, is_bonus_round: is_bonus });

        start_new_round(game);
    }

    /// Skip a finished round that nobody entered (no VRF / payout needed).
    public entry fun skip_empty_round(fulfiller: &signer, round_id: u64) acquires Game {
        let game = borrow_global_mut<Game>(@gridzero);
        assert!(signer::address_of(fulfiller) == game.fulfiller, error::permission_denied(ENOT_FULFILLER));
        assert!(round_id == game.current_round_id, error::invalid_argument(EWRONG_ROUND));
        let now = block::get_current_block_timestamp();
        {
            let r = table::borrow_mut(&mut game.rounds, round_id);
            assert!(!r.resolved, error::invalid_state(EALREADY_RESOLVED));
            assert!(now >= r.end_time, error::invalid_state(EROUND_NOT_OVER));
            assert!(r.total_players == 0, error::invalid_state(EHAS_PLAYERS));
            r.resolved = true;
        };
        event::emit(EmptyRoundSkipped { round_id });
        start_new_round(game);
    }

    // ----- internal helpers -----

    fun start_new_round(game: &mut Game) {
        let now = block::get_current_block_timestamp();
        let rid = game.current_round_id + 1;
        game.current_round_id = rid;
        let cells = vector::empty<vector<address>>();
        let i = 0;
        while (i < GRID_CELLS) {
            vector::push_back(&mut cells, vector::empty<address>());
            i = i + 1;
        };
        let end_time = now + game.round_duration;
        let r = Round {
            start_time: now,
            end_time,
            total_deposits: 0,
            total_players: 0,
            winning_cell: NO_CELL,
            resolved: false,
            is_bonus_round: false,
            init_per_winner: 0,
            zero_per_winner: 0,
            cells,
            picks: table::new<address, u8>(),
        };
        table::add(&mut game.rounds, rid, r);
        event::emit(RoundStarted { round_id: rid, start_time: now, end_time });
    }

    /// Choose the winning cell from occupied cells and return its players.
    fun pick_winner(cells: &vector<vector<address>>, vrf: &vector<u8>): (u8, vector<address>) {
        let occupied = vector::empty<u8>();
        let i = 0;
        while (i < GRID_CELLS) {
            if (vector::length(vector::borrow(cells, i)) > 0) {
                vector::push_back(&mut occupied, (i as u8));
            };
            i = i + 1;
        };
        let occ_count = vector::length(&occupied);
        let h = keccak::keccak256(*vrf);
        let idx = mod_from_bytes(&h, occ_count);
        let winning_cell = *vector::borrow(&occupied, idx);
        let winners = *vector::borrow(cells, (winning_cell as u64));
        (winning_cell, winners)
    }

    /// Motherlode trigger: keccak256(vrf || "bonus") % odds == 0.
    fun compute_bonus(vrf: &vector<u8>, odds: u64): bool {
        let bi = *vrf;
        vector::append(&mut bi, b"bonus");
        let bh = keccak::keccak256(bi);
        mod_from_bytes(&bh, odds) == 0
    }

    /// Split `distributable` among `winners`: returns (per_winner, dust_remainder).
    /// The dust (integer-division remainder) is banked as protocol fees by the
    /// caller so it is never stranded in the escrow.
    fun payout_split(distributable: u64, winners: u64): (u64, u64) {
        if (winners == 0) { return (0, distributable) };
        let per = distributable / winners;
        (per, distributable - per * winners)
    }

    /// Big-endian bytes mod m, computed with running modular arithmetic (no overflow).
    fun mod_from_bytes(bytes: &vector<u8>, m: u64): u64 {
        if (m == 0) { return 0 };
        let mm = (m as u128);
        let acc: u128 = 0;
        let i = 0;
        let n = vector::length(bytes);
        while (i < n) {
            acc = (acc * 256 + (*vector::borrow(bytes, i) as u128)) % mm;
            i = i + 1;
        };
        (acc as u64)
    }

    fun init_metadata(): Object<Metadata> {
        coin::denom_to_metadata(string::utf8(INIT_DENOM))
    }

    fun escrow_address(game: &Game): address {
        object::address_from_extend_ref(&game.escrow_ext)
    }

    fun assert_admin(game: &Game, s: &signer) {
        assert!(signer::address_of(s) == game.admin, error::permission_denied(ENOT_ADMIN));
    }

    // ----- admin -----

    public entry fun set_admin(admin: &signer, v: address) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin); g.admin = v;
    }
    public entry fun set_fulfiller(admin: &signer, v: address) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin); g.fulfiller = v;
    }
    public entry fun set_fee_recipient(admin: &signer, v: address) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin); g.fee_recipient = v;
    }
    public entry fun set_entry_fee(admin: &signer, v: u64) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin);
        assert!(v > 0, error::invalid_argument(EBAD_CONFIG));
        g.entry_fee = v;
        event::emit(ConfigUpdated { key: string::utf8(b"entry_fee"), value: v });
    }
    public entry fun set_round_duration(admin: &signer, v: u64) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin);
        assert!(v > 0, error::invalid_argument(EBAD_CONFIG));
        g.round_duration = v;
        event::emit(ConfigUpdated { key: string::utf8(b"round_duration"), value: v });
    }
    public entry fun set_protocol_fee_bps(admin: &signer, v: u64) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin);
        assert!(v <= BPS_BASE, error::invalid_argument(EBAD_CONFIG));
        g.protocol_fee_bps = v;
        event::emit(ConfigUpdated { key: string::utf8(b"protocol_fee_bps"), value: v });
    }
    public entry fun set_resolver_reward(admin: &signer, v: u64) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin); g.resolver_reward = v;
        event::emit(ConfigUpdated { key: string::utf8(b"resolver_reward"), value: v });
    }
    public entry fun set_zero_per_round(admin: &signer, v: u64) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin); g.zero_per_round = v;
        event::emit(ConfigUpdated { key: string::utf8(b"zero_per_round"), value: v });
    }
    public entry fun set_motherlode_per_round(admin: &signer, v: u64) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin); g.motherlode_per_round = v;
        event::emit(ConfigUpdated { key: string::utf8(b"motherlode_per_round"), value: v });
    }
    public entry fun set_bonus_round_odds(admin: &signer, v: u64) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin);
        assert!(v >= 1, error::invalid_argument(EBAD_CONFIG));
        g.bonus_round_odds = v;
        event::emit(ConfigUpdated { key: string::utf8(b"bonus_round_odds"), value: v });
    }
    public entry fun set_bonus_multiplier(admin: &signer, v: u64) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero); assert_admin(g, admin);
        assert!(v >= 1, error::invalid_argument(EBAD_CONFIG));
        g.bonus_multiplier = v;
        event::emit(ConfigUpdated { key: string::utf8(b"bonus_multiplier"), value: v });
    }

    /// Move banked protocol fees from escrow to the fee recipient.
    public entry fun withdraw_fees(admin: &signer) acquires Game {
        let g = borrow_global_mut<Game>(@gridzero);
        assert_admin(g, admin);
        let amt = g.accumulated_fees;
        g.accumulated_fees = 0;
        if (amt > 0) {
            let sgn = object::generate_signer_for_extending(&g.escrow_ext);
            let fa = coin::withdraw(&sgn, init_metadata(), amt);
            coin::deposit(g.fee_recipient, fa);
        };
    }

    /// Top up the escrow (e.g. to fund Motherlode bonuses). Anyone may donate INIT.
    public entry fun fund_treasury(donor: &signer, amount: u64) acquires Game {
        let g = borrow_global<Game>(@gridzero);
        let fa = coin::withdraw(donor, init_metadata(), amount);
        coin::deposit(escrow_address(g), fa);
    }

    // ----- views -----

    #[view]
    /// (round_id, start_time, end_time, total_deposits, total_players, time_remaining, resolved)
    public fun get_current_round(): (u64, u64, u64, u64, u64, u64, bool) acquires Game {
        let g = borrow_global<Game>(@gridzero);
        let rid = g.current_round_id;
        let r = table::borrow(&g.rounds, rid);
        let now = block::get_current_block_timestamp();
        let remaining = if (r.end_time > now) { r.end_time - now } else { 0 };
        (rid, r.start_time, r.end_time, r.total_deposits, r.total_players, remaining, r.resolved)
    }

    #[view]
    /// Player count per cell for the heatmap (length 25).
    public fun get_cell_counts(round_id: u64): vector<u64> acquires Game {
        let g = borrow_global<Game>(@gridzero);
        let r = table::borrow(&g.rounds, round_id);
        let out = vector::empty<u64>();
        let i = 0;
        while (i < GRID_CELLS) {
            vector::push_back(&mut out, vector::length(vector::borrow(&r.cells, i)));
            i = i + 1;
        };
        out
    }

    #[view]
    public fun get_cell_players(round_id: u64, cell: u8): vector<address> acquires Game {
        let g = borrow_global<Game>(@gridzero);
        let r = table::borrow(&g.rounds, round_id);
        *vector::borrow(&r.cells, (cell as u64))
    }

    #[view]
    public fun has_joined(round_id: u64, who: address): bool acquires Game {
        let g = borrow_global<Game>(@gridzero);
        let r = table::borrow(&g.rounds, round_id);
        table::contains(&r.picks, who)
    }

    #[view]
    /// The cell `who` picked this round, or 255 if they haven't joined.
    public fun get_player_cell(round_id: u64, who: address): u8 acquires Game {
        let g = borrow_global<Game>(@gridzero);
        let r = table::borrow(&g.rounds, round_id);
        if (table::contains(&r.picks, who)) { *table::borrow(&r.picks, who) } else { NO_CELL }
    }

    #[view]
    /// (winning_cell, resolved, is_bonus, init_per_winner, zero_per_winner, total_players, total_deposits, start_time, end_time)
    public fun get_round(round_id: u64): (u8, bool, bool, u64, u64, u64, u64, u64, u64) acquires Game {
        let g = borrow_global<Game>(@gridzero);
        let r = table::borrow(&g.rounds, round_id);
        (r.winning_cell, r.resolved, r.is_bonus_round, r.init_per_winner, r.zero_per_winner, r.total_players, r.total_deposits, r.start_time, r.end_time)
    }

    #[view]
    /// (entry_fee, round_duration, protocol_fee_bps, resolver_reward, zero_per_round, motherlode_per_round, bonus_round_odds, bonus_multiplier, fulfiller, fee_recipient)
    public fun get_config(): (u64, u64, u64, u64, u64, u64, u64, u64, address, address) acquires Game {
        let g = borrow_global<Game>(@gridzero);
        (g.entry_fee, g.round_duration, g.protocol_fee_bps, g.resolver_reward, g.zero_per_round, g.motherlode_per_round, g.bonus_round_odds, g.bonus_multiplier, g.fulfiller, g.fee_recipient)
    }

    #[view]
    public fun escrow_balance(): u64 acquires Game {
        let g = borrow_global<Game>(@gridzero);
        coin::balance(escrow_address(g), init_metadata())
    }

    #[view]
    public fun accumulated_fees(): u64 acquires Game {
        borrow_global<Game>(@gridzero).accumulated_fees
    }

    // ===== unit tests (stripped from published bytecode) =====

    #[test_only]
    fun empty_grid(): vector<vector<address>> {
        let cells = vector::empty<vector<address>>();
        let i = 0;
        while (i < GRID_CELLS) { vector::push_back(&mut cells, vector::empty<address>()); i = i + 1; };
        cells
    }

    #[test]
    fun test_mod_from_bytes() {
        // single byte
        assert!(mod_from_bytes(&vector[0u8], 5) == 0, 0);
        assert!(mod_from_bytes(&vector[5u8], 5) == 0, 1);
        assert!(mod_from_bytes(&vector[7u8], 5) == 2, 2);
        // big-endian: [1,0] = 256, 256 % 5 = 1
        assert!(mod_from_bytes(&vector[1u8, 0u8], 5) == 1, 3);
        // [1,0,0] = 65536, % 100 = 36
        assert!(mod_from_bytes(&vector[1u8, 0u8, 0u8], 100) == 36, 4);
        // m == 0 guard
        assert!(mod_from_bytes(&vector[9u8, 9u8], 0) == 0, 5);
        // mod 1 is always 0
        assert!(mod_from_bytes(&vector[123u8, 45u8, 67u8], 1) == 0, 6);
    }

    #[test]
    fun test_pick_winner_only_occupied() {
        // occupy cells 3 and 7
        let cells = empty_grid();
        vector::push_back(vector::borrow_mut(&mut cells, 3), @0xa);
        vector::push_back(vector::borrow_mut(&mut cells, 7), @0xb);
        vector::push_back(vector::borrow_mut(&mut cells, 7), @0xc);
        let (wc, winners) = pick_winner(&cells, &b"some-random-entropy");
        // winner must be one of the occupied cells, never an empty one
        assert!(wc == 3 || wc == 7, 0);
        // winners returned must equal that cell's bucket
        assert!(winners == *vector::borrow(&cells, (wc as u64)), 1);
        if (wc == 7) { assert!(vector::length(&winners) == 2, 2); }
        else { assert!(vector::length(&winners) == 1, 3); };
    }

    #[test]
    fun test_pick_winner_single_cell_deterministic() {
        // only cell 12 occupied -> must always win regardless of entropy
        let cells = empty_grid();
        vector::push_back(vector::borrow_mut(&mut cells, 12), @0xdead);
        let (wc1, w1) = pick_winner(&cells, &b"aaaa");
        let (wc2, _) = pick_winner(&cells, &b"different entropy here");
        assert!(wc1 == 12 && wc2 == 12, 0);
        assert!(vector::length(&w1) == 1, 1);
        assert!(*vector::borrow(&w1, 0) == @0xdead, 2);
    }

    #[test]
    fun test_compute_bonus() {
        // odds == 1 -> every round is a bonus round (x % 1 == 0 always)
        assert!(compute_bonus(&b"whatever", 1), 0);
        // determinism: same input -> same answer
        let a = compute_bonus(&b"fixed-entropy", 100);
        let b = compute_bonus(&b"fixed-entropy", 100);
        assert!(a == b, 1);
    }

    #[test]
    fun test_payout_split() {
        // 1 INIT split 3 ways: 333333 each, 1 uinit dust
        let (per, dust) = payout_split(1_000_000, 3);
        assert!(per == 333_333, 0);
        assert!(dust == 1, 1);
        assert!(per * 3 + dust == 1_000_000, 2); // conservation
        // exact split: no dust
        let (p2, d2) = payout_split(850_000, 1);
        assert!(p2 == 850_000 && d2 == 0, 3);
        // zero winners -> everything is dust (banked as fees, not stranded)
        let (p3, d3) = payout_split(100, 0);
        assert!(p3 == 0 && d3 == 100, 4);
    }
}
