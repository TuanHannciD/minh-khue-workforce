# Compose config tests need the real client, without a daemon or host socket.
FROM docker:29.9.3-cli@sha256:5a7af0dcb0e46c803efe9b45371dd21cb500e5b4453250394ac6f06d49b6e6f1 AS cli
FROM node:24.22.1-bookworm@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea
ENV COREPACK_HOME=/opt/corepack COREPACK_DEFAULT_TO_LATEST=0
COPY --from=cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
RUN mkdir -p "$COREPACK_HOME" \
  && corepack enable \
  && corepack install --global pnpm@12.15.0 \
  && chmod -R a+rX "$COREPACK_HOME" \
  && node --version | grep -Fx 'v24.22.1' \
  && pnpm --version | grep -Fx '12.15.0' \
  && docker --version | grep -F '29.9.3' \
  && docker compose version | grep -F 'v5.7.1'
USER node
