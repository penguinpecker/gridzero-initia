# Hermes IBC relayer for gridzero-1 <-> interwoven-1
FROM debian:trixie-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl jq tar gzip bash && \
    rm -rf /var/lib/apt/lists/*

ARG HERMES_REF=v1.13.3
ARG TARGETARCH=amd64
RUN ARCH=$([ "$TARGETARCH" = "arm64" ] && echo aarch64 || echo x86_64); \
    curl -sSL "https://github.com/informalsystems/hermes/releases/download/${HERMES_REF}/hermes-${HERMES_REF}-${ARCH}-unknown-linux-gnu.tar.gz" -o /tmp/h.tgz && \
    tar -xzf /tmp/h.tgz -C /tmp && \
    install -m 0755 /tmp/hermes /usr/local/bin/hermes && \
    rm -f /tmp/h.tgz /tmp/hermes && \
    /usr/local/bin/hermes version

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV HERMES_HOME=/data/.hermes
ENTRYPOINT ["/entrypoint.sh"]
