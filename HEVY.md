# Hevy automático no ATIVA

A integração lê a API oficial do Hevy Pro. Não cria nem modifica treinos, rotinas ou exercícios no Hevy.

## Instalação do serviço

1. Configure o Supabase original do ATIVA (`supabase.sql`).
2. Execute `supabase/migrations/202611130002_hevy.sql` no SQL Editor.
3. Publique `supabase/functions/hevy/index.ts` e `core.mjs` como função **hevy**. Pela CLI oficial, na raiz do repositório: `supabase functions deploy hevy --project-ref SEU_PROJECT_REF`.
4. A configuração em `supabase/config.toml` usa a validação obrigatória de sessão por `auth.getUser()` dentro da função, em vez do verificador JWT legado da plataforma. A função recusa usuários não autenticados antes de acessar qualquer tabela ou chave.

## Conectar a conta

Entre no ATIVA em **Sincronização privada**, com a mesma conta no PC e celular. Em **Hevy automático**, cole sua chave Hevy Pro no campo protegido e toque em **Conectar ao Hevy**. A função testa a chave e a armazena em uma tabela privada, vinculada à conta ATIVA. Não é necessário repetir a chave no outro aparelho: basta entrar na mesma conta.

A chave não vai para o GitHub, backups JSON, snapshots ou armazenamento local. A tabela tem RLS e não permite leitura ou escrita direta por navegadores. Os erros do serviço não incluem a chave nem respostas brutas do provedor.

## Comportamento

- A busca completa ocorre ao abrir o ATIVA e a cada 15 minutos enquanto estiver aberto, visível, online e sem formulário de registro em andamento. O botão “Buscar treinos agora” respeita o cache de 15 minutos do servidor.
- Exercícios, cargas (incluindo cargas negativas de exercícios assistidos), repetições, tipos de série, aquecimentos, esforço e duração são normalizados para o histórico e os gráficos existentes. Datas usam America/Sao_Paulo.
- Corridas com distância e tempo registrados no Hevy também alimentam o histórico de corrida. Notas e descrições livres do Hevy não são copiadas.
- Registros manuais e CSV são preservados. Sessões coincidentes em data, minuto, título e tipo são exibidas uma única vez, dando preferência à cópia da API.
- Alterações e exclusões no Hevy aparecem após uma busca completa. Uma cópia independente em CSV permanece disponível.
- Há um limite de proteção de 1.000 treinos, com paginação de dez itens. Falhas, respostas incompletas e mudanças no número de páginas preservam o cache anterior.
- “Desconectar Hevy” remove a chave e as cópias automáticas do serviço e do aparelho atual. O outro aparelho retira as cópias quando verificar a desconexão. Isso não revoga a chave dentro do Hevy; o titular pode revogá-la lá quando desejar.
- Backups e snapshots novos não incluem as cópias automáticas, que são recebidas novamente ao entrar na mesma conta. Os CSV e registros manuais continuam nos backups.

## Validação

`node --test tests/hevy.test.mjs tests/strava.test.mjs`

Os testes cobrem séries e aquecimentos, fuso horário, treinos mistos, paginação, falhas, deduplicação CSV/API, isolamento de backups e rejeição de sessões inválidas. A validação com a conta real depende de conectar uma chave Hevy Pro válida ao serviço instalado.

Referências: [API oficial](https://api.hevyapp.com/docs/), [acesso à API Hevy Pro](https://help.hevyapp.com/hc/en-us/articles/44834585028375-How-to-Access-and-Use-the-Hevy-API).
