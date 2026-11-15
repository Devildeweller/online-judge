# Sandbox image: toolchains for every supported language plus the oj-run supervisor.
# Containers created from it are started by the judge worker with no network, a read-only
# root filesystem and dropped capabilities (see server/src/judge/sandbox.ts).
FROM debian:trixie-slim

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      g++ libc6-dev \
      python3 \
      default-jdk-headless \
      nodejs \
      time coreutils util-linux procps \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 sandbox \
 && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /box --shell /usr/sbin/nologin sandbox \
 && mkdir -p /box /run/oj

COPY oj-run /usr/local/bin/oj-run
# Strip CRLF in case the file was checked out on Windows, then lock it down.
RUN sed -i 's/\r$//' /usr/local/bin/oj-run \
 && chown root:root /usr/local/bin/oj-run \
 && chmod 0755 /usr/local/bin/oj-run

ENV HOME=/box \
    PYTHONIOENCODING=utf-8

WORKDIR /box
CMD ["sleep", "infinity"]
