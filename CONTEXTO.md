# SW Tracker — contexto do projeto

Resumo para retomar o trabalho em outra conversa ou com outra conta.
Última atualização: 25/10/2026.

## O que é
App pessoal (PWA) para iPhone que controla os summons do Summoners War. Ele nasceu da aba **"Evoluir"** da planilha `Guia SW.xlsx`. As outras abas foram ignoradas a pedido do dono.

- **App publicado:** https://guilherme-semolin.github.io/sw-tracker/
- **Repositório:** https://github.com/guilherme-semolin/sw-tracker (público, GitHub Pages servindo a branch `main`, raiz)
- **Instalação no iPhone:** abrir no Safari → Compartilhar → Adicionar à Tela de Início

## Tecnologia
- HTML, CSS e JavaScript puros (módulos ES). **Não há build nem Node**: basta editar os arquivos e fazer push.
- `index.html`: estrutura da página, aviso de conta desconectada e abas.
- `styles.css`: tema escuro.
- `app.js`: interface (lista, filtros, tela de detalhe, ajustes).
- `store.js`: dados locais (localStorage) e sincronização com o Supabase.
- `sw.js`: service worker, que deixa o app funcionar offline. **Aumente a `VERSION` a cada publicação**: o app detecta a versão nova e recarrega sozinho uma vez.
- `config.js`: URL do Supabase e chave anon (pública; a segurança vem do login e do RLS).
- `data/seed.json`: dados iniciais (1.063 registros).
- `data/awaken2.json`: mapa do id do monstro (`mid`) para a imagem do 2º despertar.
- `img/`: ícones dos despertados em 96px webp. `img/2a/` tem as imagens do 2º despertar e `img/x<linha>.webp` as imagens tiradas da planilha.
- `icons/`: ícone do app (arte do Summoners War enviada pelo dono).

## Dados
Cada registro tem os campos:
`id, mid, nome, el, cat, nat, img, status, s5, s6, skill, runa, art, rel, a1, a2, obs, ordem, u, deleted`

- `status`: `tenho` (Coleção), `quero` (Desejos) ou `nao` (Faltando).
- `a2 = null` significa que o monstro **não tem 2º despertar**. Nesse caso a opção fica escondida e o selo "2A" não aparece.
- `ordem`: ordem em que o summon virou 6★ (coluna "Ordem" da planilha). Ao marcar 6★ no app, ele recebe automaticamente `max + 1`.
- `u`: data da última alteração em milissegundos, usada para resolver conflitos (vence a alteração mais recente).
- IDs: `s<linha da planilha>` vem da planilha; `c<com2us_id>` vem do catálogo; `u<timestamp>` é uma cópia criada no app.

Origem dos dados:
- **Planilha:** 474 summons que o dono tem, mais o Jultan (nome pintado de amarelo = desejo).
- **Catálogo:** 588 despertados de 2★ a 5★ naturais que o dono não tem, vindos da API do SWARFARM (`https://swarfarm.com/api/v2/monsters/`, filtro `awaken_level=1`, `obtainable`, `natural_stars >= 2`). As imagens também vêm do SWARFARM. O wiki do fandom bloqueia o download de imagens.
- A "estrela natural" da planilha bate com o `natural_stars` do SWARFARM.
- Correções manuais já feitas: **Haegang** e **Federica** não têm 2º despertar (`a2 = null`).
- Ainda marcados com 2A, mas sem imagem de 2º despertar no SWARFARM: **Old Wood, Tiana, Xiano Ling**.

## Nuvem (Supabase)
- Projeto **"SW Tracker"**, ref `xkxuolwcmmuxnghwmknm`, região sa-east-1, organização pessoal "Guilherme Semolin", plano gratuito.
- Tabela `public.sw_entries`: `user_id`, `id`, `data` (jsonb), `synced_at`. Chave primária `(user_id, id)`.
- Um trigger atualiza `synced_at` a cada escrita. O RLS permite que cada usuário veja e edite só as próprias linhas, e o acesso anônimo foi revogado.
- Sincronização: o app envia os registros alterados cerca de 1 s depois de cada mudança e busca o que mudou na nuvem (`synced_at > último pull`) ao abrir ou voltar para o app.
- Há uma conta de login (a do dono), confirmada manualmente pelo banco.
- Pendência opcional: no painel do Supabase, em Authentication → URL Configuration, trocar a *Site URL* (hoje `localhost`) pelo link do app.
- **Para corrigir dados direto no banco:** atualize `data` e também `data.u` com o horário atual em milissegundos, senão o iPhone não aceita a mudança. Exemplo:
  `update sw_entries set data = jsonb_set(jsonb_set(data,'{a2}','null'), '{u}', to_jsonb((extract(epoch from clock_timestamp())*1000)::bigint)) where id = 's280';`
  Corrija também `data/seed.json`, para que "Restaurar dados da planilha" não traga o erro de volta.

## Funcionalidades atuais
- Abas: **Coleção**, **Desejos**, **Faltando** e **Ajustes** (login, backup para exportar e importar JSON, restaurar dados da planilha).
- Busca por nome e filtros por elemento, estrela natural e categoria, além de Sim/Não/Todos para 5★, 6★, Skill Max, Runa Max, Artefato, Relíquia, Despertar 1 e Despertar 2.
- Ordenação: ordem 6★ (padrão), nome, estrelas ou elemento.
- A lista mostra sempre todos os selos (Skill, Runa, Art, Rel, 1A, 2A) em verde quando ativos e cinza quando não. O 2A só aparece onde existe.
- Com o 2º despertar feito, o app mostra a imagem do 2A.
- Tela de detalhe: tocar nas estrelas (6★ atribui a ordem), interruptores, mudar status (Tenho/Quero/Não tenho), observação, adicionar cópia e remover.
- Aviso laranja fixo no topo quando a conta está desconectada.

## Como publicar uma alteração
1. Edite os arquivos e aumente a `VERSION` em `sw.js`.
2. `git commit` e `git push origin main`.
3. O GitHub Pages atualiza em cerca de 1 minuto. No iPhone, basta abrir o app.

Para testar localmente: `python3 -m http.server 8770` dentro da pasta e abrir `http://localhost:8770`.
