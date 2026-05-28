# gridZERO OPinit executor bot — Railway service
FROM debian:bookworm-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl jq tar gzip bash python3 && \
    rm -rf /var/lib/apt/lists/*

ARG OPINITD_REF=v1.0.20
ARG TARGETARCH=amd64
RUN ARCH=$([ "$TARGETARCH" = "arm64" ] && echo aarch64 || echo x86_64); \
    curl -sSL "https://github.com/initia-labs/opinit-bots/releases/download/${OPINITD_REF}/opinitd_${OPINITD_REF}_Linux_${ARCH}.tar.gz" -o /tmp/o.tgz && \
    tar -xzf /tmp/o.tgz -C /tmp && \
    install -m 0755 /tmp/opinitd /usr/local/bin/opinitd && \
    rm -rf /tmp/o.tgz /tmp/opinitd && \
    /usr/local/bin/opinitd version 2>&1 | head -1

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# State lives on volume — DBs survive restart
ENV OPINIT_HOME=/data/.opinit
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
