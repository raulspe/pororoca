# Pororoca

Jogo cooperativo de navegador: cada pessoa recebe um número secreto, dá uma dica falada dentro de um tema e o grupo coloca todo mundo em ordem, do menor para o maior. Sem cadastro: entra por link ou código, só com um apelido.

Esta é a primeira fatia jogável: **modo Chill online, do criar sala até a virada**.

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm run dev
```

Abra http://localhost:5173. Para testar sozinho, abra o mesmo endereço em duas ou três abas: cada aba é um jogador. Para jogar com alguém na mesma rede, use o endereço de rede que o Vite mostra no terminal (`npm run dev -- --host`).

## Outros comandos

| Comando | O que faz |
| --- | --- |
| `npm test` | Testes das regras e da sala |
| `npm run typecheck` | Confere os tipos |
| `npm run build` | Gera a versão de produção em `dist/` |
| `npm start` | Sobe a versão de produção (tela e salas no mesmo servidor, porta `PORT` ou 3001) |

## Como está organizado

```
src/shared/   regras puras (sorteio, ordem), mensagens e os 100 temas
src/server/   salas (room.ts) e servidor HTTP + WebSocket (index.ts)
src/client/   telas em React: início, sala, carta, varal/linha, virada
tests/        testes das regras e da sala
```

O servidor é a única fonte da verdade: o navegador só envia pedidos (mover carta, dar ok) e recebe o estado da sala. O número de cada carta só sai do servidor para o dono, ou para todos depois da virada.

## O que já funciona

- Criar sala, entrar por código ou link (`/?sala=XXXX`), até 8 jogadores.
- Host escolhe o tema: sortear, escolher entre os 100 da lista ou tema livre.
- Carta com o nível da água igual ao número.
- Varal (celular) ou linha (desktop) compartilhados: qualquer pessoa arrasta, todos veem quem está movendo.
- Mexeu, os oks de todos voltam a zero. Com todos os oks, o host vira as cartas.
- Virada: "Maré cheia" (tudo em ordem) ou "Maré baixa" (aponta a primeira carta fora de ordem).
- Recarregar a página devolve o jogador ao lugar; se o host cai, outro assume.

## O que falta

- Modo Hardcore (mão que cresce, vidas, paleta própria, conquista) e modo Impostor.
- Sons de água e o restante das microinterações do protótipo em vídeo.
- Publicar em um servidor para jogar pela internet.
