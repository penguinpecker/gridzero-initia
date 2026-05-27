/// $ZERO - the gridZERO reward token.
///
/// Native Initia fungible asset (initia_std::coin / fungible_asset standard), the
/// Move-native replacement for the original ERC-20 `ZeroToken` on Base. Minting is
/// restricted to the `gridzero::game` module via a `friend` declaration, mirroring
/// the original "GridZeroV4 is the sole authorized minter" design.
module gridzero::zero_token {
    use std::option;
    use std::string;
    use initia_std::coin::{Self, MintCapability, BurnCapability, FreezeCapability};
    use initia_std::fungible_asset::{Metadata, FungibleAsset};
    use initia_std::object::{Self, Object};

    friend gridzero::game;

    /// Display name + ticker, unchanged from the Base deployment.
    const NAME: vector<u8> = b"GridZero";
    const SYMBOL: vector<u8> = b"ZERO";
    /// 6 decimals - matches Initia/Cosmos native convention (uinit also has 6).
    const DECIMALS: u8 = 6;

    /// Mint/burn/freeze capabilities, held at @gridzero so the friend `game`
    /// module can mint without needing the metadata-object signer.
    struct Caps has key {
        mint_cap: MintCapability,
        burn_cap: BurnCapability,
        freeze_cap: FreezeCapability,
    }

    /// Runs automatically when the package is published under @gridzero.
    fun init_module(deployer: &signer) {
        let (mint_cap, burn_cap, freeze_cap) =
            coin::initialize(
                deployer,
                option::none<u128>(), // total supply is a policy cap (1B), not enforced on-chain
                string::utf8(NAME),
                string::utf8(SYMBOL),
                DECIMALS,
                string::utf8(b""), // icon_uri
                string::utf8(b"")  // project_uri
            );
        move_to(deployer, Caps { mint_cap, burn_cap, freeze_cap });
    }

    /// Mint `amount` (base units) of $ZERO. Callable only by `gridzero::game`.
    public(friend) fun mint(amount: u64): FungibleAsset acquires Caps {
        let caps = borrow_global<Caps>(@gridzero);
        coin::mint(&caps.mint_cap, amount)
    }

    #[view]
    /// The $ZERO metadata object.
    public fun metadata(): Object<Metadata> {
        coin::metadata(@gridzero, string::utf8(SYMBOL))
    }

    #[view]
    /// Address of the $ZERO metadata object (use this as the asset id in clients).
    public fun metadata_address(): address {
        object::object_address(&metadata())
    }
}
