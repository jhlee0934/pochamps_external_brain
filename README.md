<div align="center">

# 포챔스 외장두뇌


![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Streamable_HTTP-222222?style=flat-square)

[웹사이트](https://jhlee0934.github.io/pochamps_external_brain/) · [주요 기능](#주요-기능) · [로컬 실행](#로컬-실행) · [MCP 서버](#mcp-서버)

</div>

---

메타 순위와 인기 세팅을 살펴보고, 내 파티의 화력·내구·스피드를 비교합니다. 한국어 이름으로 검색하고 세팅을 편집할 수 있으며, 웹의 데미지 계산은 브라우저에서 실행합니다.

웹은 MCP 서버 없이 사용할 수 있습니다. 파티와 계산기 입력값은 현재 브라우저의 **localStorage**에 저장됩니다.

## 주요 기능

| 화면 | 할 수 있는 일 |
| :--- | :--- |
| **메타** | 싱글·더블 순위 조회, 이름 검색, 타입 필터 |
| **포켓몬 상세** | 종족값과 기술·도구·특성·성격·SP·동반 포켓몬 확인, 최근 31일 순위 추이, 파티 추가, 계산기로 보내기, 커스텀 샘플 작성 |
| **내 파티** | 파티 최대 6개 관리, 세트 편집(기술별 결정력·SP 매직 넘버 표시), 인기 세팅 채우기, Showdown 형식 가져오기·내보내기, 타입 상성표 |
| **SP 배분 효과** | SP와 세팅을 바꿨을 때 메타 상대의 확정수·생존 여부·스피드 추월 변화 비교, 내 랭업기·상대 랭업기를 따로 켜서 비교 |
| **스피드 라인** | 별도 탭에서 래더 전체(또는 상위 30·50·100), 내 파티 탭에서 상위 30·50·100과 비교, 동속 포켓몬 한 줄 표시, 구애스카프·랭업기·특성 랭업 추가 표시 |
| **결정력 계산** | 기술 4개 동시 계산, 반대 방향 계산, 상대를 지정하지 않은 메타 상위 30·50·100 대상 공격 범위 비교, 공격·방어 측 랭업기 토글, 사용률 SP 배분 프리셋 |
| **대면표** | 내 포켓몬 한 마리와 메타 상위 20·30·50의 최고 화력·스피드·유불리 비교 |

### 계산에 반영하는 조건

- **기본 규칙** — 레벨 50, 개체값 31, SP는 능력치별 최대 32·합계 최대 66.
- **랭크업** — 랭업기와 랭크를 올리는 특성(가속·지구력·오기 등)을 토글로 적용합니다. 여러 번 오르는 특성도 1회 발동으로 계산합니다.
- **날씨 특성** — 날씨를 직접 고르지 않으면 가뭄·잔비·모래날림·눈퍼뜨리기 특성의 날씨를 자동 적용합니다(공격 측 우선). 메타 비교 계산에도 같은 규칙이 적용됩니다.
- **포켓몬 상태** — 메가진화, 능력치 랭크, 상태이상, 남은 HP.
- **배틀 환경** — 날씨, 필드, 리플렉터·빛의장막, 스텔스록, 압정 1~3단, 급소.
- **스피드 비교** — 메타 기본 줄에서는 구애스카프 배율을 제외하고, 버튼을 켜면 스카프 착용 줄을 추가합니다. 내 파티의 장착 도구는 항상 반영합니다.

## 로컬 실행

**Node.js 24**와 npm을 기준으로 개발·빌드했습니다. 저장소 루트에서 실행합니다.

```bash
npm ci --prefix server
npm ci --prefix web
npm run dev --prefix web
```

웹 주소: **http://localhost:5173**

웹이 `server/src`의 계산·데이터·한국어 이름 모듈을 공유하므로 두 디렉토리의 의존성을 모두 설치합니다. 웹만 사용할 때는 서버 실행이나 `.env` 설정이 필요하지 않습니다.

<details>
<summary><strong>빌드·타입 검사·테스트</strong></summary>

```bash
npm run typecheck --prefix server
npm run typecheck --prefix web
npm test --prefix web
npm run build --prefix web
```

`npm test`는 물리·특수형 세트 분리, 랭업 계산, 커스텀 샘플, 스피드 라인 묶음 같은 핵심 로직을 Vitest로 확인합니다. 배포 워크플로도 빌드 전에 테스트를 실행합니다.

웹 빌드 결과는 `web/dist`에 생성됩니다.

</details>

<details>
<summary><strong>Windows에서 웹·MCP·터널 한 번에 실행</strong></summary>

의존성 설치와 아래 MCP 환경변수 설정을 마친 뒤, Cloudflared가 설치된 환경에서 루트의 `start-dev.bat`를 실행합니다.

웹 개발 서버, MCP 서버, Cloudflare 임시 터널을 별도 창에서 시작합니다. 사용 중인 포트와 실행 중인 터널은 건너뜁니다. 종료는 각 창에서 `Ctrl+C`를 누릅니다.

사전 검사만 실행하려면:

```bat
start-dev.bat --check
```

임시 터널을 재시작하면 공개 주소가 바뀝니다.

</details>

## GitHub Pages 배포

1. 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
2. 변경 사항을 `main`에 푸시합니다.
3. **Actions → Deploy web to GitHub Pages**에서 배포 결과를 확인합니다. 수동 실행은 **Run workflow**를 사용합니다.

배포 주소: https://jhlee0934.github.io/pochamps_external_brain/

Pages 배포본은 `#/party`, `#/calc` 같은 해시 경로를 사용해 새로고침을 지원합니다. 워크플로는 **`web/dist`만** 업로드하며 MCP 서버와 `server/.env`는 배포하지 않습니다.

## MCP 서버

웹과 별도로 실행하는 TypeScript MCP 서버입니다. **Streamable HTTP·stateless** 방식으로 데이터 조회와 계산 도구를 제공합니다. 결과에는 한국어 이름을 포함하며, AI가 숫자를 추측하는 대신 도구 결과를 해석하도록 서버 지침을 제공합니다.

| 도구 | 기능 |
| :--- | :--- |
| `get_usage` | 포켓몬별 기술·도구·특성·성격·SP·동반 포켓몬 조회, 시즌 선택 |
| `get_meta_ranking` | 싱글·더블 순위와 인기 항목 조회, 타입 필터·페이징 |
| `get_usage_trend` | 최근 최대 31일 순위·채용률 추이 조회 |
| `calc_damage` | 데미지 범위·확정수 계산, 인기 세팅으로 생략값 채우기, 습득 불가 기술 경고 |

포켓몬·기술·도구·특성·성격·타입 이름을 **한국어 또는 영어**로 입력할 수 있습니다. 한국어 이름은 결과의 `ko`, 확정수는 `koChance` 필드로 반환합니다.

<details>
<summary><strong>서버 실행 및 클라이언트 연결</strong></summary>

`server/.env.example`을 `server/.env`로 복사하고 `MCP_PATH_SECRET`에 16자 이상의 비밀값을 설정합니다.

```bash
npm run dev --prefix server
```

기본 엔드포인트:

```text
http://localhost:8787/mcp/<MCP_PATH_SECRET>
```

실행 중인 서버의 도구 호출 확인:

```bash
npm run smoke --prefix server -- http://localhost:8787/mcp/<MCP_PATH_SECRET>
```

외부 원격 MCP 클라이언트에 연결할 때는 공개 HTTPS 주소를 사용합니다. 로컬 테스트용 터널:

```bash
cloudflared tunnel --url http://localhost:8787
```

클라이언트에 등록할 URL:

```text
https://<터널 주소>/mcp/<MCP_PATH_SECRET>
```

현재 도구는 모두 읽기 전용이며 접근 제어는 비밀 경로를 사용합니다. 연결 URL과 `.env`는 공개하지 마세요.

</details>

## 데이터 읽는 법

- **순위와 사용률은 다릅니다.** API는 포켓몬 자체의 순위를 제공하며, 포켓몬별 사용률 %·승률·표본 수는 제공하지 않습니다.
- **인기 항목은 각각 집계됩니다.** 기술·도구·성격·SP의 1위 항목을 합친 세팅은 실제 조합을 확인한 값이 아닌 근사치입니다.
- **메가폼 데이터는 기본 포켓몬에 합산됩니다.** 여러 폼의 비교에는 도구 채용률을 활용합니다.
- **성격·SP·기술은 물리형·특수형끼리 짝지어 고릅니다.** 싱글·더블 각각의 물리·특수 성격 비율에 맞춰 폼에 역할을 배정합니다(예: 메가리자몽 Y는 특수, X는 물리). 공격·특공 종족값 차이가 뚜렷한 폼은 그 역할을 따르되 해당 역할의 성격 비율이 10% 미만이면 데이터를 따르고, 종족값이 비슷한 폼은 주류 역할을 가장 적은 폼으로 설명하도록 나눕니다(예: 더블 메가루카리오Z 85.7% ≈ 특수 성격 86% → 나머지 루카리오는 물리). 기술은 역할에 맞는 공격기와 변화기 중 상위 4개를 쓰며, 반대 분류 기술은 채용률이 반대 역할 비율보다 10%p 이상 높을 때만 포함합니다(망나뇽의 신속은 항상 포함). 한 폼 안에서 비주류 역할이 10% 이상이면 `메가보만다(특수)`처럼 그 역할만 표시한 별도 항목을 추가합니다. 비율은 추정치입니다.
- **일별 추이는 시즌 누적 스냅샷입니다.** 해당 날짜 하루만의 전적을 뜻하지 않습니다.
- **파티 저장은 브라우저별입니다.** 다른 기기나 사이트 주소로 옮길 때는 파티 내보내기·가져오기를 사용하세요.
- **커스텀 샘플은 순위와 관계없이 비교에 포함됩니다.** 포켓몬 상세에서 만든 샘플은 결정력 계산·SP 배분 효과·스피드 라인·대면표에 `커스텀` 표시와 함께 나오며, 파티처럼 이 브라우저에만 저장됩니다.

## 프로젝트 구조

```text
pochamps/
├─ web/                         React + Vite 웹 앱
│  └─ src/
│     ├─ pages/                 메타 · 상세 · 파티 · 계산기 · 대면표
│     ├─ components/            세트 편집 · SP 비교 · 메타 공격 범위
│     ├─ lib/                   파티 저장 · Showdown 변환 · UI 계산 로직
│     └─ workers/               대량 계산용 Web Worker
├─ server/
│  ├─ src/
│  │  ├─ calc/                  Champions 계산 · 메가폼 처리
│  │  ├─ data/                  배틀 API · 한국어 이름 · 이미지 ID
│  │  ├─ tools.ts               MCP 도구 정의
│  │  └─ index.ts               HTTP 진입점 · 접근 제어 · 요청 제한
│  └─ scripts/                  MCP 호출 확인 · 이름 사전 생성
├─ .github/workflows/           웹 자동 배포
└─ start-dev.bat                Windows 개발 실행 도우미
```

<details>
<summary><strong>한국어 이름 및 이미지 매핑 갱신</strong></summary>

```bash
npm run build:ko --prefix server
```

PokeAPI CSV에서 `ko-names.json`과 `pokeapi-ids.json`을 생성합니다. 신규 특성이나 PokeAPI에 없는 한국어 폼 이름은 `server/src/data/ko-overrides.json`에서 보완합니다. 생성 시 출력되는 미등록 이름을 확인해 추가하세요.

이미지는 [PokeAPI/sprites](https://github.com/PokeAPI/sprites)의 특정 커밋을 고정해 jsDelivr에서 불러옵니다. 목록에는 Champions 아이콘, 상세에는 HOME 이미지를 사용합니다.

</details>

## 출처

- **배틀 데이터** — Battle data provided by [Pokémon Champions Battle Data](https://championsbattledata.com/). [API 규칙](https://championsbattledata.com/api-rules/)에 따라 응답은 메모리에 임시 캐시하며 원본을 영구 저장·재배포하지 않습니다.
- **한국어 이름·이미지 공급 경로** — [PokéAPI](https://github.com/PokeAPI/pokeapi) · [PokeAPI/sprites](https://github.com/PokeAPI/sprites)
- **데미지 계산** — [@smogon/calc](https://github.com/smogon/damage-calc) · MIT

---

포챔스 외장두뇌는 개인용·비상업 팬 프로젝트입니다. Pokémon 및 관련 명칭·이미지의 권리는 The Pokémon Company, Nintendo, Creatures, GAME FREAK에 있으며, 본 프로젝트는 이들과 관련이 없습니다.
