# Kortix (Suna) — Roadmap de Instalação na Hetzner

**Stack:** Frontend (Next.js) + API (Bun/Hono) + Sandbox (Ubuntu webtop + DinD) + Supabase (Postgres/Kong/GoTrue/PostgREST)
**Modo:** VPS, Docker (auto-config)
**Alvo:** Eval rápida (2-3 dias), root user, US-East/West para latência BR
**Tempo estimado:** 30-45 min

---

## ⚠️ Avisos críticos antes de começar

- [ ] **NÃO rodar `curl ... | bash` 2x** — o installer detecta install existente e ao responder `y` em "Reinstall?" executa `docker volume rm kortix_supabase-db-data` automaticamente. **Perde TODO o banco.** Pra atualizar use `kortix update`.
- [ ] **Postgres exposto em `0.0.0.0:13741` por default** no modo VPS. Tem que fechar antes de expor a VPS publicamente (Fase 3.5).
- [ ] **Docker bypassa UFW via iptables** — UFW sozinho não bloqueia portas Docker. Usar Cloud Firewall da Hetzner + bind correto no compose.

---

## CREDENCIAIS QUE PRECISO DE VOCÊ

Marca aqui o que já tem:

- [x] **IP público da VPS Hetzner** → `5.78.177.255`
- [x] **Caminho do SSH key privado** local → padrão (`~/.ssh/id_ed25519`)
- [ ] **Domínio próprio** (opcional, pra Fase 5 HTTPS)
  - [ ] DNS provider com acesso (Cloudflare/Route53/etc)
- [ ] **Pelo menos 1 LLM API key** (configurada via UI depois, não no .env):
  - [ ] OpenRouter (recomendado — agrega vários providers)
  - [ ] OU Anthropic / OpenAI / Gemini / Groq direto
- [ ] **Pipedream** (opcional — habilita 3000+ integrações):
  - [ ] `PIPEDREAM_CLIENT_ID`
  - [ ] `PIPEDREAM_CLIENT_SECRET`
  - [ ] `PIPEDREAM_PROJECT_ID`
- [ ] **Slack** (opcional — channel integration):
  - [ ] `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`

---

## FASE 0 — Provisionar VPS Hetzner (5 min)

- [x] Criar VPS na Hetzner Cloud Console:
  - [x] **Tipo**: provisionada (149.92 GB disk, 8 GB RAM disponível)
  - [x] **Imagem**: Ubuntu 24.04.3 LTS
  - [x] **Localização**: Hillsboro US-West (presumido pelo IP `5.78.x.x`)
  - [x] **SSH key**: ok
- [x] Criar **Cloud Firewall** com regras de entrada (TCP):
  - [x] Configurado via UFW dentro da VM (Cloud Firewall opcional como defesa extra)
  - [x] `22`, `80`, `443`, `13737`, `13738`, `13740` allowed
  - [x] `13741` NÃO aberto (e bind agora é 127.0.0.1)
- [x] Anotar IP público → `5.78.177.255`

---

## FASE 1 — Preparar SO (3 min, como root)

```bash
ssh root@SEU_IP_HETZNER

# Sanity
apt update && apt upgrade -y

# Dependências do installer (Docker + Compose v2 + openssl + python3 + curl)
apt install -y curl openssl python3 ca-certificates

# Docker (script oficial — instala Compose v2 junto)
curl -fsSL https://get.docker.com | sh

# UFW como defesa em profundidade (não substitui Cloud Firewall)
apt install -y ufw
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw allow 13737/tcp && ufw allow 13738/tcp && ufw allow 13740/tcp
ufw --force enable

# Verificação
docker version && docker compose version
```

- [x] SSH funcionando como root
- [x] `apt update && upgrade` rodou sem erro (system restart pendente — agendar `reboot` ao final)
- [x] `docker version` mostra Docker 29.4.0
- [x] `docker compose version` mostra Compose v2 (v5.1.3)
- [x] UFW ativo com as portas certas

---

## FASE 2 — Rodar o installer (10-15 min)

```bash
curl -fsSL https://kortix.com/install | bash
```

Quando perguntar:
1. **"Where are you running Kortix?"** → digitar `2` (VPS / Server)
   - Detecta IP via `ifconfig.me`. Se falhar, informa o IP público manualmente.
2. **"Database"** → digitar `1` (Docker — recommended)

O que o installer faz por baixo (verificado em `scripts/get-kortix.sh`):
- Cria `~/.kortix/` com `.env` (chmod 600), `docker-compose.yml`, `kong.yml`, init SQL, CLI `kortix`
- Resolve versão estável via GitHub Releases API
- `docker pull` paralelo (3 imagens Kortix + 4 Supabase)
- Gera secrets: `POSTGRES_PASSWORD`, `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_SERVICE_KEY`, `API_KEY_SECRET`, `TUNNEL_SIGNING_SECRET`
- `docker compose up -d`
- Espera frontend responder em `http://SEU_IP:13737`
- Cria symlink `/usr/local/bin/kortix`

Output esperado ao final:
```
Dashboard   http://SEU_IP:13737
API         http://SEU_IP:13738
```

- [x] Installer rodou sem erro fatal — versão **v0.8.44**
- [x] Mostrou `Dashboard   http://5.78.177.255:13737`
- [x] CLI `kortix` linkado em `/usr/local/bin/kortix`

---

## FASE 3 — Validação básica (2 min)

```bash
kortix status            # todos containers Up/healthy
kortix logs kortix-api   # sem erros de boot (Ctrl+C pra sair)
curl http://localhost:13738/v1/health   # API responde JSON
curl -I http://SEU_IP:13737             # frontend retorna 200 ou 308
```

- [x] `kortix status` mostra 6 containers Up (frontend, kortix-api, supabase-db/auth/rest/kong) — todos healthy
- [x] `/v1/health` responde `{"status":"ok","service":"kortix-api","version":"0.8.44",...}`
- [x] Frontend retorna `HTTP/1.1 200 OK`

---

## FASE 3.5 — Fechar Postgres público (CRÍTICO, 1 min)

```bash
sed -i 's|0.0.0.0:13741:5432|127.0.0.1:13741:5432|' ~/.kortix/docker-compose.yml
kortix restart
docker ps --format '{{.Names}}\t{{.Ports}}' | grep supabase-db
# deve mostrar 127.0.0.1:13741, NÃO 0.0.0.0:13741
```

- [x] `sed` aplicado — `docker-compose.yml` agora tem `127.0.0.1:13741:5432`
- [x] `kortix restart` sem erro
- [x] `docker ps` confirma `kortix-supabase-db-1   127.0.0.1:13741->5432/tcp`

---

## FASE 4 — Criar conta owner via UI (2 min)

- [ ] Abrir `http://SEU_IP:13737` no browser
- [ ] Clicar em sign-up / criar conta
- [ ] Email + senha → primeiro usuário vira **owner/admin** automaticamente
- [ ] Logou no dashboard

> Nota: GoTrue está com `MAILER_AUTOCONFIRM=true` (linha 943 do installer), então signup auto-confirma sem mandar email. Sem SMTP configurado, signup ainda funciona.

---

## FASE 5 — HTTPS + domínio com Caddy (opcional, ~5 min)

Pré-req: DNS A records apontando pra IP da VPS (`app.dominio.com`, `api.dominio.com`, `auth.dominio.com`).

```bash
# Instalar Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# Caddyfile
cat > /etc/caddy/Caddyfile <<'EOF'
app.dominio.com {
  reverse_proxy 127.0.0.1:13737
}
api.dominio.com {
  reverse_proxy 127.0.0.1:13738
}
auth.dominio.com {
  reverse_proxy 127.0.0.1:13740
}
EOF

systemctl reload caddy
```

**CRÍTICO** (linhas 1006-1013 do installer): `SUPABASE_URL` server-side e `NEXT_PUBLIC_SUPABASE_URL` client-side **devem bater**. `@supabase/ssr` deriva nome do cookie do hostname — se trocar URL sem sincronizar, signup quebra silencioso.

```bash
# Editar ~/.kortix/.env, atualizar:
nano ~/.kortix/.env
# PUBLIC_URL=https://app.dominio.com
# API_PUBLIC_URL=https://api.dominio.com
# SUPABASE_PUBLIC_URL=https://auth.dominio.com

kortix restart
```

Fechar portas brutas no firewall depois que HTTPS funcionar:
```bash
ufw delete allow 13737/tcp
ufw delete allow 13738/tcp
ufw delete allow 13740/tcp
# E remover essas regras no Cloud Firewall da Hetzner também
```

- [ ] DNS records criados e propagados (`dig app.dominio.com` resolve)
- [ ] Caddy instalado
- [ ] Caddyfile salvo com domínios corretos
- [ ] `systemctl status caddy` ativo
- [ ] `~/.kortix/.env` editado com URLs HTTPS
- [ ] `kortix restart` ok
- [ ] `https://app.dominio.com` carrega com cadeado
- [ ] Signup funciona no domínio HTTPS
- [ ] Portas brutas removidas do UFW e Cloud Firewall

---

## FASE 6 — Configurar LLM keys via UI (5 min)

LLM keys NÃO vão no `.env` do installer (verificado: `grep OPENROUTER ~/.kortix/.env` → vazio). Configurar pela UI:

- [ ] Logar como owner
- [ ] Settings → LLM Providers (ou equivalente — verificar nome exato no menu)
- [ ] Adicionar pelo menos uma:
  - [ ] OpenRouter API key (recomendado)
  - [ ] OU Anthropic / OpenAI / etc.
- [ ] Testar criando um agent básico → ele consegue responder

---

## FASE 7 — Pipedream + Slack (opcional, no `.env` do installer)

Essas SÃO slots reais no `.env` (verificado: `grep PIPEDREAM ~/.kortix/.env` mostra os campos vazios):

```bash
nano ~/.kortix/.env
# Preencher:
# PIPEDREAM_CLIENT_ID=...
# PIPEDREAM_CLIENT_SECRET=...
# PIPEDREAM_PROJECT_ID=...
# PIPEDREAM_ENVIRONMENT=production
# SLACK_CLIENT_ID=...
# SLACK_CLIENT_SECRET=...
# SLACK_SIGNING_SECRET=...

kortix restart
```

- [ ] Pipedream creds adicionadas (se quiser integrações)
- [ ] Slack creds adicionadas (se quiser channel)
- [ ] `kortix restart` aplicado

---

## OPERAÇÃO DIA-A-DIA

| Comando | O que faz |
|---|---|
| `kortix start` | Sobe stack inteira |
| `kortix stop` | Para tudo |
| `kortix restart` | Restart |
| `kortix logs` | Tail de todos containers (`kortix logs kortix-api` para um só) |
| `kortix status` | `docker compose ps` |
| `kortix update` | Pull da última release + restart (**preserva volumes**) |
| `kortix reset` | **WIPE total** — pede confirmação |
| `kortix uninstall` | Remove tudo |
| `kortix version` | Versão instalada |

### Backup dos volumes que importam

```bash
# Descobrir nomes reais (defensivo, em caso de override)
docker volume ls | grep -E "supabase-db|sandbox"

# Backup
docker run --rm -v kortix_supabase-db-data:/data -v $PWD:/backup alpine \
  tar czf /backup/db-$(date +%F).tar.gz -C /data .

docker run --rm -v kortix-hosted-sandbox-data:/data -v $PWD:/backup alpine \
  tar czf /backup/sandbox-$(date +%F).tar.gz -C /data .
```

| Volume | Conteúdo | Recuperável? |
|---|---|---|
| `kortix_supabase-db-data` | Postgres (usuários, agents, projetos) | **NÃO** sem backup |
| `kortix-hosted-sandbox-data` | Workspace persistente do sandbox | **NÃO** sem backup |
| `sandbox_docker` | DinD images cache | sim, recriável |

---

## Pegadinhas conhecidas

- [ ] **Sandbox spawnado precisa do Docker socket** — a API monta `/var/run/docker.sock` (linha 1089 do installer). Não rode em host onde isso é proibido.
- [ ] **Reinstall = wipe** — `curl install | bash` em cima de install existente + `y` apaga `kortix_supabase-db-data`. Sempre `kortix update`.
- [ ] **Bind 0.0.0.0 sem proxy** = qualquer IP do mundo acessa frontend/API/Postgres. Por isso a Fase 3.5 e o Caddy + remoção das portas brutas.
- [ ] **`SUPABASE_URL` ↔ `NEXT_PUBLIC_SUPABASE_URL`** têm que bater — cookies do `@supabase/ssr`.

---

## Status atual da execução

- [x] Fase 0 — VPS provisionada (`5.78.177.255`)
- [x] Fase 1 — SO preparado (Docker 29.4.0, Compose v5.1.3, UFW ativo)
- [x] Fase 2 — Installer rodou (Kortix v0.8.44, 6 containers up)
- [x] Fase 3 — Validação OK (health 200, frontend 200)
- [x] Fase 3.5 — Postgres fechado (`127.0.0.1:13741`)
- [x] Fase 4 — Conta owner criada (`contato@bernardolima.com.br`, instance `540f64af-776d-41b9-89e9-3b5bf072b315`)
- [ ] Fase 5 — HTTPS + domínio (opcional)
- [ ] Fase 6 — LLM keys via UI
- [ ] Fase 7 — Pipedream/Slack (opcional)

---

# 🐛 Bugs e gotchas encontrados nesta instalação

> Documentado pra evitar repetição quando subir em produção. Versão testada: **Kortix v0.8.44**.

## 1. Installer não roda via SSH não-interativo

**Sintoma:**
```
/tmp/get-kortix.sh: line 305: /dev/tty: No such device or address
```
Acontece se você tentar `printf '2\n1\n' | ssh root@vps 'bash get-kortix.sh'` ou pipar respostas via stdin sem TTY.

**Causa raiz:** o script (`scripts/get-kortix.sh` linhas 95-98) checa `[ -r /dev/tty ] && [ -w /dev/tty ]`. Em SSH não-interativo, `/dev/tty` existe mas não é acessível → set `TTY_AVAILABLE=1` e depois falha ao abrir.

**Fix produção:** **rode interativo via `ssh -t root@vps` e responda os 2 prompts manualmente** (`2` para VPS, `1` para Docker). Levam 5 segundos. Não tente automatizar via stdin pipe.

**Se PRECISAR automatizar** (ex: terraform/ansible):
```bash
sed -i 's|if \[ -r /dev/tty \] && \[ -w /dev/tty \]; then|if false; then|' /tmp/get-kortix.sh
printf '2\n1\n' | bash /tmp/get-kortix.sh
```

---

## 2. Postgres exposto em `0.0.0.0:13741` por default no modo VPS

**Sintoma:** `docker ps` mostra `kortix-supabase-db-1   0.0.0.0:13741->5432/tcp`. Qualquer IP do mundo pode tentar autenticar no Postgres.

**Causa raiz:** `scripts/get-kortix.sh` linha 877 — quando `DEPLOY_MODE=vps`, `bind_addr=0.0.0.0` é aplicado a TODAS as portas, incluindo Postgres. Não há separação entre portas de aplicação (frontend/api/kong) e portas internas (db).

**Fix produção (obrigatório, fazer ANTES de expor a VPS):**
```bash
sed -i 's|0.0.0.0:13741:5432|127.0.0.1:13741:5432|' /root/.kortix/docker-compose.yml
kortix restart
```

**Por que UFW sozinho não basta:** Docker manipula iptables direto e bypassa regras UFW. A única garantia é o bind correto no compose.

---

## 3. OpenCode JSONC bootstrap escreve escape inválido

**Sintoma:** popup na UI do dashboard:
```
Config ignored
Runtime healthy
InvalidEscapeCharacter at line 2, column 2
"\$schema": "https://opencode.ai/config.json"
```

**Causa raiz:** o bootstrap do sandbox escreve `/workspace/.opencode/opencode.jsonc` com `\$schema` (escape estilo bash heredoc) que é inválido em JSONC. JSONC só aceita escapes JSON-padrão (`\"`, `\\`, `\/`, `\n`, etc.). O **failsafe** (documentado em `docs/opencode-config-failsafe-spec.md`) detecta o erro e ignora o config — runtime continua healthy mas config customizado não carrega.

**Fix:**
```bash
docker exec kortix-hosted-sandbox python3 -c "open('/workspace/.opencode/opencode.jsonc','w').write('{\n  \"\$schema\": \"https://opencode.ai/config.json\"\n}\n')"
```
Depois clicar **Fix** na UI ou dar refresh.

**Lição produção:** após primeiro signup + spawn do sandbox, rodar `docker exec kortix-hosted-sandbox cat /workspace/.opencode/opencode.jsonc` e validar. Se vier com `\$schema`, aplicar o fix antes de qualquer outra coisa. **Pode estar corrigido em versões > 0.8.44** — verificar.

---

## 4. Spam de "Stripe sync error" nos logs da API

**Sintoma:** a CADA request da UI:
```
[resolve-account] Stripe sync error for <user-id>: Failed query: 
select "account_id", "id", "email", "active", "provider" 
from "basejump"."billing_customers" where "basejump"."billing_customers"."account_id" = $1
```

**Causa raiz:** o middleware `resolve-account` consulta `basejump.billing_customers` mesmo com `KORTIX_BILLING_INTERNAL_ENABLED=false`. A migration que cria essa tabela é parte do schema basejump mas algo na ordem de bootstrap não está garantindo que ela exista no self-hosted, OU o middleware deveria pular a query quando billing está desabilitado e não pula.

**Impacto:** **cosmético** — não bloqueia funcionalidade. Mas polui logs (uma linha por request, debug fica difícil).

**Workaround produção:** filtrar nos logs (`kortix logs kortix-api 2>&1 | grep -v "Stripe sync error"`) ou aceitar o ruído. Bug a reportar upstream.

---

## 5. React DOM crash "removeChild" — System Fault

**Sintoma:** tela inteira preta com:
```
System Fault
Failed to execute 'removeChild' on 'Node': 
The node to be removed is not a child of this node.
```

**Causa raiz:** clássico React DOM crash quando algo externo manipula a árvore DOM. Causas mais comuns:
- Extensões de browser (Grammarly, Google Translate, AdBlock agressivo, password managers)
- Hydration mismatch transitório no Next.js 14/15 (rare em produção, comum em dev)

**Fix:**
1. Botão **Reload** na própria tela (90% dos casos).
2. Janela anônima (sem extensões) → confirma se é extensão.
3. Logs do frontend container (`kortix logs kortix-frontend-1 2>&1 | tail -50`) se persistir.

**Lição produção:** documentar pros usuários finais que tradutor automático (Google Translate) quebra Next.js apps. Sugerir desativar pra `app.dominio.com`.

---

## 6. Sandbox demora ~30-60s pra ficar usável após primeiro signup

**Sintoma:** logo após criar conta owner, a UI mostra:
```
Workspace container unavailable
The host is up, but the managed workload service or container is unhealthy.
Restart the workload layer first.
```

**Causa raiz:** no modo VPS, o installer **NÃO** faz pre-warm do sandbox (a função `warm_local_sandbox` só roda em `DEPLOY_MODE=local` — linha 312). O sandbox é spawnado **lazy** quando o user loga pela primeira vez. O container Ubuntu webtop + DinD demora ~30-60s pra subir XFCE + serviços + s6.

**Fix:** **esperar ou clicar Retry**. Não é bug — é design lazy.

**Lição produção:** se quiser pre-warm também em VPS, chamar `POST /v1/setup/local-sandbox/warm` logo após o install completar. Idealmente automatizar isso no installer pra modo VPS.

---

## 7. dbus/XFCE warnings nos logs do sandbox

**Sintoma:** `docker logs kortix-hosted-sandbox` mostra constantemente:
```
dbus-daemon[616]: [system] Activated service 'org.freedesktop.login1' failed: 
Failed to execute program org.freedesktop.login1: Permission denied
./run: line 58: ... Aborted (core dumped) exec s6-setuidgid abc /bin/bash /defaults/startwm.sh
WARNING:data_websocket:Cannot broadcast cursor data: no clients connected or server not ready.
```

**Causa raiz:** o sandbox roda XFCE em container sem systemd. `logind` não está disponível, então XFCE/dbus reclamam mas seguem funcionando via fallback. WebSocket warnings são normais quando ninguém está conectado no desktop view.

**Impacto:** **cosmético**. Health endpoint responde 200 normalmente.

---

## 8. System restart pendente após `apt upgrade`

**Sintoma:** banner SSH mostra `*** System restart required ***`.

**Causa raiz:** kernel ou libc atualizados, processos antigos rodando.

**Fix:** agendar reboot fora de janela de uso (`shutdown -r +5 "kortix maintenance"`). Após reboot, todos os containers (com `restart: unless-stopped`) sobem automático.

---

# 🛡️ Hardening adicional pra produção (que pulamos no eval)

Itens que **NÃO** fizemos por ser eval rápido — fazer antes de qualquer cliente real:

- [ ] **Criar user não-root** com sudo, desabilitar SSH password auth, mover SSH pra porta não-padrão
- [ ] **Cloud Firewall da Hetzner** (defesa em profundidade — UFW pode ser bypassado por Docker)
- [ ] **HTTPS obrigatório** (Caddy/nginx com Let's Encrypt + HSTS) — Fase 5 do roadmap
- [ ] **Backup automatizado diário** dos volumes `kortix_supabase-db-data` e `kortix-hosted-sandbox-data` pra S3/R2
- [ ] **Monitoring**: Better Stack ou similar (`BETTERSTACK_API_LOG_TOKEN` no `.env` pra logs estruturados, `BETTERSTACK_API_SENTRY_DSN` pra error tracking — são vars que **não** estão no template do installer mas são lidas pela API se você adicionar)
- [ ] **Rate limiting** no reverse proxy (Caddy/nginx) pra `/auth/v1/signup` — sem isso, signup spam fica trivial
- [ ] **Desabilitar signup público** se for instância privada — editar GoTrue env `GOTRUE_DISABLE_SIGNUP=true` no `~/.kortix/docker-compose.yml`
- [ ] **Postgres backup com WAL archiving**, não só snapshots de volume
- [ ] **Verificar OpenCode config** após primeiro signup (bug #3 deste doc) e aplicar fix se necessário
- [ ] **Filtrar log spam do Stripe sync** (bug #4) ou esperar fix upstream
- [ ] **Limitar CORS_ALLOWED_ORIGINS** no `.env` apenas pros domínios reais (default é `PUBLIC_URL` só)
- [ ] **Trocar `INTEGRATION_AUTH_PROVIDER=pipedream` para `disabled`** se não for usar Pipedream — evita warnings desnecessários
- [ ] **`docker compose` com restart policy explícito**: já vem `unless-stopped`, mas verificar se não foi alterado em algum override
- [ ] **Atualização agendada**: `kortix update` num cron semanal (após validar em staging) — versões saem rápido
