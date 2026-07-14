# bot-pesca

Bot de automação (mineflayer) para registrar, logar, coletar o kit de pesca e manter várias contas pescando AFK no servidor RankUp da `nerdzone.gg`.

## Pré-requisitos

- [Node.js](https://nodejs.org/) instalado (LTS recente)
- Contas Minecraft já criadas no servidor (o script apenas executa `/registrar`, não cria a conta na plataforma)

## Instalação

```bash
npm install
```

## Configurando as contas

As credenciais reais ficam em `accounts.json`, que **não é versionado** (está no `.gitignore`) para não vazar senha e contas. Use `accounts.json.example` como modelo:

```bash
cp accounts.json.example accounts.json
```

Edite `accounts.json`:

```json
{
  "server": {
    "host": "nerdzone.gg",
    "port": 25565,
    "version": "1.21.11"
  },
  "password": "sua_senha",
  "accounts": [
    { "username": "SuaConta01", "status": "error", "registered": false, "logged_in": false, "kit_collected": false, "fishing_started": false },
    { "username": "SuaConta02", "status": "error", "registered": false, "logged_in": false, "kit_collected": false, "fishing_started": false }
  ]
}
```

- `server`: host/porta/versão do servidor. Só mude se o servidor mudar.
- `password`: senha usada em `/registrar` e `/logar` para **todas** as contas listadas.
- `accounts`: uma entrada por conta, com o `username` exatamente como cadastrado no servidor. Os demais campos (`registered`, `logged_in`, `kit_collected`, `fishing_started`, `status`) são atualizados automaticamente pelos scripts — não precisa preenchê-los à mão, mas devem existir no JSON.

## Fluxo de uso

Rode os passos abaixo nessa ordem, uma vez por conta nova:

### 1. Registrar as contas no servidor

```bash
npm run register
```

Executa `/registrar <senha> <senha>` em cada conta que ainda não está marcada como registrada.

### 2. Logar e coletar o kit de pesca

```bash
npm run login
```

Loga com `/logar <senha>`, entra no servidor de RankUp e garante que cada conta tenha a Fishing Rod (via `/kit iniciante`), salvando o progresso em `accounts.json`.

### 3. Iniciar a farm de pesca

```bash
npm run farm
```

Conecta todas as contas (com espaçamento entre logins para não sobrecarregar o proxy), garante login + kit, manda cada uma para `/pesca`, equipa a vara e começa a pescar AFK. Fica rodando indefinidamente (`Ctrl+C` para parar), com um watchdog que reativa a vara a cada 5 minutos se a contagem de peixes parar de subir.

### Diagnóstico

Se alguma conta falhar, use:

```bash
npm run diagnose
```

Ou, para depurar uma conta específica no fluxo de `/pesca`/`/peixes` com log de mensagens cru:

```bash
node diagnose-pesca.js <username>
```

## Observações

- Todo o estado de progresso (login, kit, pesca) é persistido em `accounts.json` a cada execução, então os scripts podem ser interrompidos e retomados sem repetir passos já concluídos.
- Nunca faça commit de `accounts.json` — ele contém a senha real e a lista de contas.
