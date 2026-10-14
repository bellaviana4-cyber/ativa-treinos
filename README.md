# ATIVA — treinos e corrida

Aplicativo pessoal de acompanhamento de musculação e corrida em **dark mode com detalhes rosa**, projetado para uso no celular. Funciona como **PWA**: depois de publicado em HTTPS, pode ser adicionado à tela inicial do Android ou iPhone.

## O que o aplicativo faz

- organiza quatro fichas de musculação por semana, com exercícios substituíveis;
- registra cargas, repetições, séries de trabalho, séries de aquecimento e RIR;
- acompanha três sessões de corrida semanais, quilometragem, tempo e pace;
- permite editar as 19 semanas de progressão e acompanhar medidas e peso;
- exibe histórico e evolução, importa CSV do Hevy/Strava e exporta backup JSON;
- funciona offline depois do primeiro carregamento da PWA;
- oferece sincronização opcional por uma conta Supabase, **não configurada neste repositório**.

## Como publicar o site

1. Abra **Settings → Pages** neste repositório.
2. Em **Build and deployment**, selecione **Deploy from a branch**.
3. Escolha **main** e **/(root)**; clique em **Save**.
4. Aguarde a implantação. Depois, teste: **https://bellaviana4-cyber.github.io/ativa-treinos/**

GitHub Pages serve os arquivos do site publicamente. Ele não sincroniza seus dados pessoais entre aparelhos: para isso é preciso configurar o serviço opcional descrito abaixo.

## Instalar na tela inicial

**Android (Chrome):** abra o link do aplicativo no Chrome, toque no menu **⋮** e escolha **Instalar app** ou **Adicionar à tela inicial**.

**iPhone (Safari):** abra o link no Safari, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**; confirme **Adicionar**. O ATIVA ficará com ícone próprio e abrirá como aplicativo.

> A instalação no aparelho deve ser feita no próprio celular. O link de GitHub acima só ficará funcional após habilitar o GitHub Pages.

## Sincronização privada (opcional)

O app salva registros no armazenamento local do navegador. Para sincronizar entre dispositivos:

1. Crie **seu projeto** em https://supabase.com/dashboard.
2. Execute [supabase.sql](supabase.sql) no **SQL Editor**. Ele cria a tabela privada e ativa **Row Level Security (RLS)**.
3. Em **Configurações → Sincronização privada** no ATIVA, insira a URL HTTPS do projeto e somente a chave pública **publishable** ou **anon**.
4. Crie sua conta no aplicativo, confirme o e-mail quando necessário e entre.
5. No celular que já tem dados, faça um backup JSON e use **Enviar dados locais**. No outro, faça login e use **Receber dados da nuvem**.
6. Após a primeira escolha, o app tenta salvar novas alterações na nuvem. Se detectar conflito, pausa a sincronização para evitar sobrescrita silenciosa.

**Nunca** forneça uma chave secreta, `service_role` ou senha do banco ao aplicativo. Sem Supabase, o aplicativo continua funcionando localmente. Atualizações feitas em um aparelho não aparecerão automaticamente na tela do outro; use **Receber dados da nuvem** para atualizá-la.

## Privacidade e backup

- **Nenhum dado pessoal do Hevy foi colocado neste repositório público.**
- Não envie `workouts.csv`, o HTML pessoal, relatórios de peso, backups JSON ou senhas para o GitHub.
- Backups são feitos em **Configurações → Exportar backup JSON**. Exporte regularmente e antes de trocar de dispositivo.
- O banco Supabase tem políticas RLS por usuário, mas os registros não têm criptografia ponta a ponta.
- A importação Strava é por **CSV**, não por login direto.
- As séries de aquecimento são identificadas como **AQ.**, podem ser modificadas e não contam como séries efetivas.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `index.html` | aplicativo completo sem dados pessoais |
| `manifest.webmanifest` | nome, cores e ícones da instalação PWA |
| `sw.js` | cache e navegação offline |
| `icons/` | ícones rosa de 192 e 512 px |
| `supabase.sql` | tabela privada e regras de acesso para sincronização |

---
Versão 2.0 · 2026–2027.
