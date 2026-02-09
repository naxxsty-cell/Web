# Deploy (Look what I can do)

## Quick start

```bash
cd look-what-i-can-do
PORT=8081 docker compose up -d --build
```

Open: `http://<server-ip>:8081`

Health: `http://<server-ip>:8081/health`

## Change port

```bash
PORT=8090 docker compose up -d --build
```
