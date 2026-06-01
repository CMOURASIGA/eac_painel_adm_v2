# US-078 - Adapter temporario Google Sheets

## Objetivo
Isolar a origem de dados (Supabase vs Google Sheets) para que o frontend e as telas consumam apenas uma interface de execução de action.

## Entregas deste passo
- Interface `BackendActionAdapter`
- Implementações:
  - `SupabaseAdapter`
  - `GoogleSheetsAdapter`
- Seletor de adapter por feature flag (`selectAdapter`)

Arquivo:
- `services/backendActionAdapter.ts`

## Estratégia de uso
1. Endpoints continuam sendo a porta de entrada oficial.
2. O adapter decide a origem (Supabase preferencial, Sheets fallback temporário).
3. Quando a migração terminar, remover `GoogleSheetsAdapter` sem impacto no frontend.

## Próxima integração recomendada
- Consumir o adapter em `api/comunicados.ts` para concentrar o fallback e reduzir acoplamento ao Google Script.
