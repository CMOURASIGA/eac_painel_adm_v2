# Arte da Agenda EAC: o que precisa existir no projeto

Os dois arquivos `.tsx` já estão prontos. O visual do folder de referência depende de
**4 fontes e 2 imagens** que ficam em `public/`. Sem elas a arte ainda é gerada, mas com
fonte/imagem de reserva e visual mais simples.

## Imagens (`public/assets/eac/`)

| Arquivo | O que é | Observações |
|---|---|---|
| `selo-eac.png` | Selo redondo "Encontro de Adolescentes com Cristo · Niterói-RJ" | PNG com fundo transparente, mínimo 600×600 px. **Obrigatório.** |
| `foto-jovens-duotone.jpg` | Foto dos jovens abraçados, já em tom azul-marinho | Mínimo 1200×900 px. O efeito duotone precisa estar **gravado na imagem**: o `html2canvas` ignora `filter` e `mix-blend-mode`. Opcional (sem ela o rodapé fica só na cor de fundo). |

## Fontes (`public/assets/eac/fonts/`, formato `.woff2`)

Todas são gratuitas (Google Fonts, licença OFL). Baixe e converta para `.woff2`.

| Arquivo | Família | Uso |
|---|---|---|
| `PermanentMarker-Regular.woff2` | Permanent Marker | Títulos de pincel: "AGENDA EAC", "Fique ligado!", "Amizade, fé, serviço, sempre!" |
| `ArchivoBlack-Regular.woff2` | Archivo Black | Logotipo "EAC", números dos dias, mês e ano |
| `Nunito-ExtraBold.woff2` | Nunito 800 | Horários |
| `Nunito-Black.woff2` | Nunito 900 | Nomes dos eventos e textos de apoio |

## O que mudou em relação à versão anterior

**PublicAgendaArt.tsx**
- Novo formato `whatsapp` (1200×675, layout horizontal próprio). Feed, story e quadrado têm medidas e quantidade de eventos ajustadas por formato (`ART_SIZE`).
- Papel rasgado, pinceladas e faixas feitos com SVG inline (o `html2canvas` não renderiza `clip-path`).
- Ícones em SVG inline escolhidos pelo nome da atividade: grupo (Pós-encontro), coroa (Nossa Senhora), cruz (São João Paulo II, missa, retiro), pessoas (reunião) e calendário (padrão). Para incluir novos tipos, edite `iconFor`.
- Selo oficial, frase "Amizade, fé, serviço, sempre!", megafone, "Não fique de fora!" e o link em pílula branca (o endereço vem do `calendarUrl`).
- Os eventos que não cabem no formato aparecem como "+N eventos no calendário completo".
- Logo e imagens agora vêm do próprio projeto (antes: imgur e GitHub raw).
- `waitForArtAssets()` espera fontes, imagens e `decode()` antes da captura.

**PublicEacCalendar.tsx**
- Opção "WhatsApp · 1200×675" e prévia em tela da arte antes de gerar.
- Exportação usa `waitForArtAssets`, `backgroundColor:null` e o tamanho exato do formato (`EXPORT_SCALE=1`; mude para 2 se quiser o dobro de resolução).
- Eventos da arte ordenados por data; "semana" e "evento" usam o dia selecionado no calendário.
- Header da página usa o mesmo `selo-eac.png`.

## Pontos de atenção para teste

1. A arte "semana" só enxerga os eventos do mês carregado; uma semana que cruza dois meses sai incompleta (a API busca um mês por vez).
2. Testar a exportação no celular (Chrome Android e Safari iOS), que é onde o `navigator.share` com arquivo aparece.
3. Se alguma rotação ou sombra sair diferente do preview, a alternativa é trocar o `html2canvas` por `html-to-image` ou gerar a imagem no servidor.
4. Os ícones e o desenho do papel rasgado são aproximações do folder. Se o designer entregar PNGs/SVGs finais de pincelada e rabiscos, eles podem substituir os `Torn` sem mudar a lógica.