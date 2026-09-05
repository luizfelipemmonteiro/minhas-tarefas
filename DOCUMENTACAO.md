# Minhas Tarefas

App de tarefas para **iPhone, iPad e Mac**, instalado na tela de início.
Uso pessoal: sem contas, sem servidor, sem cadastro — e **sem custo nenhum,
para sempre**.

> A versão nativa em Swift também está aqui, em `MinhasTarefas.xcodeproj`.
> Ela funciona, mas exige o Xcode e, no iPhone/iPad, precisa ser reinstalada
> a cada 7 dias. Por isso a versão principal passou a ser esta.
> Detalhes dela em [NATIVO.md](NATIVO.md).

---

## 1. Instalar

O app já está publicado. Abra este endereço no aparelho:

### https://luizfelipemmonteiro.github.io/minhas-tarefas/

E instale:

| Aparelho | Como instalar |
| --- | --- |
| **iPhone / iPad** | Safari → botão **Compartilhar** → **Adicionar à Tela de Início** |
| **Mac** | Safari → menu **Arquivo** → **Adicionar ao Dock** |

Uma vez instalado ele abre em tela cheia, sem barra de navegador, com ícone
próprio — e **funciona offline**, porque o app inteiro fica guardado no
aparelho. Não expira nunca e não precisa de Xcode.

---

## 2. O que ele faz

A **tela inicial tem só as pastas**, com dois botões no topo: **⚙︎ Ajustes**
e **+ nova pasta**. Nada de busca, contadores ou listas automáticas — as
pastas são o app.

Dentro de uma pasta, uma **tira de abas** lista todas as outras: um toque
passa de uma para a outra sem voltar para a estante, como as divisórias de um
ficheiro. A aba ativa sobe e ganha a cor cheia da pasta.

| Recurso | Onde está |
| --- | --- |
| Estante de pastas, com a pasta abrindo em 3D | `js/main.js`, `styles.css` |
| Tira de abas para trocar de pasta em um toque | `js/ui.js`, `styles.css` |
| Círculo de concluir + risco animado | `js/ui.js`, `styles.css` |
| “Ocultar tarefas concluídas” (menu ⋯) | `js/ui.js` |
| Escrita com Apple Pencil em papel pautado | `js/ink.js` |
| Tarefas recorrentes | `js/recurrence.js`, `js/sheets.js` |
| Data, local, notas, prioridade, sinalizar | `js/sheets.js` |
| Nome e cor da pasta | `js/sheets.js` |
| Sincronização e backup | `js/sync.js` |
| Funcionar offline | `sw.js` |

### Personalização

De propósito, só duas coisas: o **nome** e a **cor** da pasta (dezoito tons,
gerados na mesma saturação e luminosidade para conviverem sem nenhum gritar
mais alto que os outros).
Não há escolha de fonte, tamanho, símbolo ou tema — o app tem um desenho só,
e é ele que segura a coisa toda de pé.

A **ordem** das pastas (que vale para a estante e para a tira de abas) fica
em **⚙︎ Ajustes → Ordem das pastas**.

### Escrita à mão (iPad e iPhone)

Dentro de uma pasta, o botão do lápis abre um papel pautado.
**Cada pauta vira uma tarefa.** Você escreve, para de escrever, e a linha
entra na lista sozinha — com a sua letra, não com texto digitado.

O Apple Pencil chega ao Safari como Pointer Event com pressão e inclinação,
então o traço tem a mesma sensibilidade de um app nativo. **A caneta sempre
desenha e o dedo rola a página**, igual ao app Notas; quem não tem Apple
Pencil troca no botão **Dedo**, e a escolha fica guardada. Reescrever em cima
da mesma pauta atualiza a mesma tarefa; apagar a linha com a borracha apaga a
tarefa.

> **Por que a rolagem é feita à mão.** O canvas usa `touch-action: none`. Com
> qualquer outro valor, o Safari do iPad interpreta um traço vertical do Apple
> Pencil como rolagem e a tela balança em vez de escrever — e `preventDefault`
> não resolve, porque `touch-action` é decidido antes de o evento chegar ao
> JavaScript. Em troca de tirar a rolagem do navegador, o `InkPad` a
> reimplementa, com inércia e velocidade limitada.

A caligrafia é guardada como vetor e desenhada como **silhueta**, recebendo a
cor do app — é isso que a mantém legível no modo claro e no escuro. Uma linha
manuscrita ocupa cerca de 200 bytes, então milhares delas cabem
tranquilamente no arquivo de sincronização.

### Tarefas recorrentes

- todo dia / a cada N dias
- toda semana, nos dias escolhidos (seg + qui, por exemplo)
- todo mês **no dia 10**, **no primeiro dia**, **no último dia**, ou **na 2ª terça**
- todo ano, em um mês e dia
- terminando numa data ou depois de N vezes

Ao concluir, a próxima ocorrência é criada com a data já calculada. O editor
mostra as **próximas 5 datas** antes de você confirmar. Casos chatos estão
cobertos: “dia 31” cai em 28 de fevereiro e **volta** para 31 em março, em vez
de ficar preso no 28.

---

## 3. Duas limitações honestas

São consequências de ser um site instalado, e não um app da App Store. Nenhuma
delas tem contorno sem pagar:

1. **Não há notificação com o app fechado.** O iOS não dá essa permissão a um
   site na tela de início sem um servidor de push. As tarefas com data
   aparecem em destaque em “Hoje”, e o ícone ganha um selo com a contagem —
   mas o aparelho não toca sozinho.
2. **A letra não vira texto automaticamente.** O reconhecimento de caligrafia
   do iOS não é exposto para a web. A tinta é guardada como você escreveu; se
   quiser texto pesquisável naquela tarefa, toque nela e digite — e no iPad dá
   para escrever com o Pencil direto no campo de texto, que aí o **Scribble**
   do próprio iOS converte para texto.

---

## 4. Sincronizar entre os aparelhos

Opcional. Sem isso, cada aparelho guarda as suas tarefas e o backup é por
arquivo (seção 5).

O repositório privado já existe: **`luizfelipemmonteiro/minhas-tarefas-dados`**.
Falta só o token, que só você pode criar:

1. Abra <https://github.com/settings/personal-access-tokens/new>
2. **Repository access** → *Only select repositories* → `minhas-tarefas-dados`
3. **Permissions** → *Repository permissions* → **Contents: Read and write**
   (só isso — deixe todo o resto em "No access")
4. Gere e copie o token (`github_pat_…`)

No app: Ajustes → em **Repositório** escreva `luizfelipemmonteiro/minhas-tarefas-dados`,
cole o token em **Token**, e toque em **Testar conexão**.
Repita nos três aparelhos.

**Por que repositório privado e não gist:** gist “secreto” só é não-listado —
quem tiver o endereço lê. Repositório privado é privado de verdade.
**O token fica só no aparelho** (no armazenamento local do navegador) e vai
apenas para `api.github.com`.

**Um token por aparelho.** O token fica guardado só no aparelho onde você o
colou — ele não viaja junto com os dados, e é isso que o mantém seguro. Então
repita a configuração no iPhone, no iPad e no Mac, apontando os três para o
mesmo repositório. O que você guarda **não some ao fechar o app**: fica no
armazenamento local, que sobrevive a reinícios e a atualizações do app.

**Conflitos:** o merge é item a item. Se a mesma tarefa foi editada em dois
aparelhos, vale a mais recente; itens diferentes convivem sem perda.
Exclusões viram lápides, então apagar num aparelho apaga no outro em vez de o
item “ressuscitar”.

---

## 5. Backup em arquivo

**⚙︎ Ajustes** → **Exportar tudo**. Gera um `.json` que você pode guardar no iCloud
Drive. **Importar** junta o arquivo com o que já existe, mantendo a versão
mais recente de cada item — então dá para usar como restauração ou como
sincronização manual entre aparelhos.

Os dados ficam no aparelho, em IndexedDB, e o app pede ao navegador para
marcar esse espaço como persistente. Ainda assim, exportar de vez em quando
é a garantia real — faça isso antes de trocar de aparelho.

---

## 6. Publicar (GitHub Pages)

Já publicado em <https://luizfelipemmonteiro.github.io/minhas-tarefas/>,
a partir do repositório público `luizfelipemmonteiro/minhas-tarefas`.
O *código* fica visível; os seus *dados* nunca entram nele.

Para publicar mudanças depois:

```bash
cd ~/Documents/MinhasTarefas/web
git add -A && git commit -m "descrição da mudança" && git push
```

O Pages republica sozinho em um ou dois minutos.

### Rodar localmente para testar

```bash
python3 -m http.server 8765 --directory web
```

Depois abra <http://localhost:8765>.

### Atualizações

O service worker serve o app do cache e busca a versão nova em paralelo, então
uma mudança aparece **na segunda vez** que você abrir o app. Para forçar na
hora, suba o número em `VERSION` dentro de `sw.js`.

---

## 7. Decisões de projeto

- **Sem dependências e sem etapa de build.** É HTML, CSS e JavaScript puro.
  Não há `npm install` para apodrecer: daqui a dez anos ainda abre.
- **Cores e tipografia do iOS**, não aproximações — os valores do sistema
  estão em `styles.css`, com a especificação anotada em cada bloco
  (corpo 17/22 com tracking −0.41, título grande 34/41, etc.).
- **Curvas de animação do UIKit**: `cubic-bezier(0.32, 0.72, 0, 1)` é
  literalmente a curva das folhas modais e do empurrar de telas do iOS.
  Tudo respeita “Reduzir movimento”.
- **Alvos de toque de 44 × 44 pt** mesmo quando o desenho é menor.
- **O risco da tarefa é um degradê atrás das letras**, com
  `box-decoration-break: clone`. É o que faz o traço acompanhar o texto
  quando ele quebra em duas linhas — `text-decoration` não é animável.
- **Paleta de papel quente**, não o cinza-azulado padrão do iOS: o fundo é
  claro e neutro para que a cor venha só das pastas.
- **A pasta é uma forma só**, plana, com uma sombra colorida macia — nada de
  camadas imitando papelão. O degradê que dá volume é neutro e compartilhado
  por todas as cores, num `<defs>` único.
- **A engrenagem dos ajustes é gerada por cálculo**
  (`r(θ) = médio + amplitude · tanh(k·cos(Nθ))`), não desenhada no olho: é o
  que garante dentes iguais e simétricos.
- **Desfazer** (⌘Z) guarda os últimos 25 estados.
