# Conexão automática do ATIVA com Strava

O código está preparado, mas a conexão só funciona depois de configurar **seu projeto Supabase e seu aplicativo Strava**. Nenhuma credencial real acompanha o repositório.

## Preparação única

1. Crie um projeto em https://supabase.com/dashboard. No **SQL Editor**, execute `supabase.sql` (configuração original do ATIVA) e depois `supabase/migrations/202611130001_strava.sql` (integração). A migração Strava pode ser repetida; o script original de políticas deve ser executado apenas uma vez.
2. Em **Authentication → URL Configuration**, use `https://bellaviana4-cyber.github.io/ativa-treinos/` como **Site URL**. Mantenha a confirmação de e-mail e o login por e-mail habilitados.
3. Crie um aplicativo pessoal em https://www.strava.com/settings/api. Nome sugerido: **ATIVA**. Website: `https://bellaviana4-cyber.github.io/ativa-treinos/`. **Authorization Callback Domain:** `bellaviana4-cyber.github.io` (sem `https://` e sem caminho). O titular do aplicativo deve ser a conta Strava que você deseja conectar. Restrições de acesso/capacidade do aplicativo são definidas pelo Strava.
4. No Supabase, em **Edge Functions → Secrets**, adicione `STRAVA_CLIENT_ID` e `STRAVA_CLIENT_SECRET`, usando os valores do aplicativo criado no Strava. **Não cole o Client Secret no ATIVA, no GitHub, no chat nem em arquivos públicos.** As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas pelo próprio Supabase à função.
5. Publique a função `strava`, incluindo os dois arquivos de `supabase/functions/strava/`. Para quem usa a CLI oficial:

   ```sh
   supabase login
   supabase functions deploy strava --project-ref SEU_PROJECT_REF
   ```

   Execute a partir da raiz deste repositório. `supabase/config.toml` desliga somente o verificador JWT legado da plataforma; a função **sempre valida a sessão do usuário com `auth.getUser()`**, antes de qualquer operação. Não remova essa validação. Não há endpoint público de callback: o retorno do Strava é concluído pelo navegador autenticado.
6. No ATIVA, configure a URL pública e a publishable key do projeto em **Sincronização privada** e crie/entre na sua conta. A senha dessa conta é diferente da senha do banco.
7. Em **Strava automático**, clique em **Conectar ao Strava**. Entre no Strava e autorize a leitura das atividades, incluindo as privadas. Conclua no mesmo navegador e na mesma conta ATIVA em até dez minutos.

## Uso no PC e no celular

Use a mesma conta Supabase nos dois aparelhos. A conexão Strava é vinculada à conta, portanto a autorização só precisa ser feita uma vez. Ao abrir o ATIVA em cada aparelho, ele busca as corridas, mesmo sem escolher enviar ou receber o snapshot de musculação. Para fichas, medidas e registros manuais, continue usando a sincronização privada original.

Com o ATIVA aberto, visível e online, há uma busca a cada **15 minutos**. Não é uma integração por webhook: com o aplicativo fechado, a próxima busca acontece ao reabri-lo. A atualização também é adiada enquanto um formulário de treino estiver aberto para preservar o preenchimento. “Buscar corridas agora” respeita o cache de 15 minutos do servidor.

São importadas corridas `Run`, `TrailRun` e `VirtualRun`, somente com nome, data/hora local, distância e tempo em movimento. Não são armazenados GPS, mapas, fotos, descrição ou perfil do atleta. As atividades aparecem no histórico e nas estatísticas existentes do ATIVA. Não há escrita de atividades no Strava.

Uma busca completa reconcilia as corridas alteradas ou excluídas no Strava. Cópias importadas por CSV e registros manuais são independentes e permanecem. O limite de proteção é menos de 4.000 atividades totais na conta Strava; se uma busca ficar incompleta ou falhar, a cópia anterior é preservada. Limites de API podem adiar a busca.

“Desconectar” revoga a autorização e remove as cópias automáticas do serviço e do aparelho atual; o outro aparelho as remove quando verificar a desconexão. As cópias API não entram em backups JSON ou snapshots novos: são recebidas novamente do serviço. Exportações antigas já criadas não podem ser alteradas pelo aplicativo.

## Segurança e testes

- Tokens Strava e Client Secret ficam apenas no servidor. As tabelas de tokens e estados OAuth têm RLS habilitado e nenhum acesso concedido ao navegador.
- O estado OAuth é aleatório, válido por dez minutos, vinculado à conta e consumido uma única vez. O código é retirado da barra de endereço imediatamente.
- Sincronizações simultâneas usam uma reserva no banco. Resultados parciais não substituem o cache; renovação de tokens fica no servidor.
- Rode `node --test tests/strava.test.mjs` para testar normalização, paginação, limites, deduplicação e ausência de tokens/GPS nos dados devolvidos.
- O teste completo com conta real só pode ocorrer depois de instalar a migração, publicar a função, cadastrar os dois secrets e autorizar no Strava. O código publicado sozinho não ativa essa infraestrutura.

Documentação: [OAuth Strava](https://developers.strava.com/docs/authentication/), [atividades Strava](https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities), [secrets no Supabase](https://supabase.com/docs/guides/functions/secrets).
