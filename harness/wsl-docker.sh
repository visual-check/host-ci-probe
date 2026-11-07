#!/bin/bash
# Research: inside the WSL2 Ubuntu, as root. Installs docker.io, keeps Docker's bridge off WSL's NAT range, and has
# systemd's dockerd also listen on 127.0.0.1:2375 so the Windows runner's docker.exe can be its client.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -q > /dev/null
apt-get install -yq docker.io dbus-x11 > /dev/null
docker --version
# WSL2 NAT takes a random /20 from 172.16.0.0/12, which Docker's default 172.17.0.0/16 can overlap
mkdir -p /etc/docker
echo '{"bip":"10.11.0.1/24","default-address-pools":[{"base":"10.12.0.0/16","size":24}]}' > /etc/docker/daemon.json
if [ -d /run/systemd/system ]; then
  echo "systemd, dockerd at $(command -v dockerd)"
  mkdir -p /etc/systemd/system/docker.service.d
  printf '[Service]\nExecStart=\nExecStart=%s -H fd:// -H tcp://127.0.0.1:2375 --containerd=/run/containerd/containerd.sock\n' "$(command -v dockerd)" > /etc/systemd/system/docker.service.d/tcp.conf
  systemctl daemon-reload
  systemctl restart docker
  systemctl is-active docker containerd
else
  echo "no systemd"
  nohup dockerd -H unix:///var/run/docker.sock -H tcp://127.0.0.1:2375 > /var/log/dockerd.log 2>&1 &
fi
for _ in $(seq 1 60); do docker info > /dev/null 2>&1 && break; sleep 1; done
docker info --format '{{.ServerVersion}} {{.OperatingSystem}} {{.NCPU}} CPUs {{.MemTotal}} {{.Driver}}'
df -h / | tail -1
