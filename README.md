# pochamps

포켓몬 챔피언스(싱글) 대전 보조 도구. 개인용·비상업 프로젝트입니다.

LLM 기능은 자체 API 호출 대신 **MCP 서버**로 제공하고, Claude / ChatGPT 구독에 커스텀 커넥터로 연결해서 씁니다.
숫자(사용률, 데미지, 확정수)는 항상 도구가 계산하고, LLM은 해석과 설명만 합니다.

## 구성

```
server/            MCP 서버 (TypeScript, Streamable HTTP, stateless)
  src/
    config.ts        환경변수
    data/battleData.ts  championsbattledata.com API 어댑터 (메모리 TTL 캐시)
    calc/champions.ts   @smogon/calc Champions 모드(gen 0) 래퍼, SP 검증
    tools.ts         MCP 도구 정의
    server.ts        McpServer + 사용 지침(instructions)
    index.ts         HTTP 진입점, 비밀 경로, rate limit
  scripts/smoke.ts   실행 중인 서버 대상 E2E 확인
web/               웹 앱 (Vite + React). 계산·데이터·한국어 이름은 server/src 모듈을 그대로 공유
```

## 웹 앱

```bash
cd web
npm install
npm run dev     # http://localhost:5173
```

서버 없이 브라우저만으로 동작합니다(배틀 데이터 API는 CORS 허용, 데미지 계산은 브라우저에서 실행).
파티와 계산기 입력값은 브라우저 localStorage에만 저장됩니다.

| 화면 | 기능 |
|---|---|
| 메타 | 싱글/더블 사용률 순위, 검색, 타입 필터 |
| 포켓몬 상세 | 종족값, 기술·도구·특성·성격·SP 배분·동반 포켓몬, 31일 순위 추이, 파티 추가, 계산기로 보내기 |
| 내 파티 | 여러 파티 관리, 세트 편집(SP 66/32 검증, 배울 수 있는 기술만), 사용률 1위 세팅 채우기, Showdown 형식 가져오기/내보내기(한국어 이름 가능), 타입 상성표, 메타 상위 30 대비 스피드 라인 |
| 결정력 계산 | 기술 4개 동시 계산, 반대 방향 결과, 메가진화 토글, 랭크·상태이상·남은 HP, 날씨·필드·벽·스텔스록·압정(1~3단)·급소 토글. 방어 측을 정하지 않아도 기술별로 메타 상위 30/50/100마리를 몇 타에 잡는지와 결정력 수치 표시 |
| 대면표 | 내 포켓몬 1마리 vs 메타 상위 20/30/50의 최고 화력·스피드·유불리 판정 |

스프라이트는 [PokeAPI/sprites](https://github.com/PokeAPI/sprites)를 특정 커밋으로 고정해 jsDelivr에서 불러옵니다
(목록은 챔피언스 아이콘, 상세는 HOME 이미지). ID 매핑은 `server/src/data/pokeapi-ids.json`이며 `npm run build:ko`가 함께 만듭니다.

### 도구

| 이름 | 설명 |
|---|---|
| `get_usage` | 포켓몬별 래더 사용률: 기술·도구·특성·성격·SP 배분·동반 포켓몬 (시즌 선택 가능) |
| `get_meta_ranking` | 싱글/더블 사용률 순위(순위만, % 없음)와 포켓몬별 1위 기술·도구·특성·성격. 타입 필터, 페이징 |
| `get_usage_trend` | 최근 N일(최대 31) 순위·채용률 추이. 스냅샷은 시즌 누적값이며 M6부터 존재 |
| `calc_damage` | 챔피언스 규칙(Lv50, IV 31, SP)으로 데미지 범위·확정수 계산. `useCommonSet`으로 빠진 값을 사용률 1위로 채움(항목별 독립 선택이라 근사치). 배울 수 없는 기술이면 `warnings`에 표시 |

모든 도구는 포켓몬·기술·도구·특성·성격·타입 이름을 **영어 또는 한국어**로 받습니다
("메가한카리아스Z", "알로라 라이츄", "구애스카프", "명랑" 등). 결과에는 공식 한국어 이름이 `ko` 필드로 함께 들어갑니다.
`calc_damage`의 확정수는 `koChance` 필드입니다.

### 한국어 이름 사전

`server/src/data/ko-names.json`은 [PokeAPI](https://github.com/PokeAPI/pokeapi) CSV에서 생성합니다.
PokeAPI에 없는 이름은 `server/src/data/ko-overrides.json`에 직접 적습니다.

```bash
cd server
npm run build:ko
```

현재 한국어 이름이 없는 항목: 특성 Aura Guard, Eelevate, Fire Mane (챔피언스 신규, 영어로 표시).
PokeAPI에 한국어 폼 이름이 없는 일부 폼은 `시비꼬(Blue)`처럼 영어 폼 이름을 붙여 둡니다.

### 데이터 한계

- 포켓몬 자체의 사용률 %, 승률, 표본 수는 API에 없음 (순위만 제공)
- 기술·도구·성격·SP는 각각 따로 집계되어 조합 정보가 없음
- 메가진화 폼은 기본 포켓몬 데이터에 합산됨
- API의 `baseStats`는 종족값이 아니라 Lv50·SP 0 실수치이므로 계산에는 쓰지 않음

## 실행

```bash
cd server
npm install
cp .env.example .env   # MCP_PATH_SECRET 채우기
npm run dev            # 또는 npm run build && npm start
```

엔드포인트: `http://localhost:8787/mcp/<MCP_PATH_SECRET>`

확인:

```bash
npm run smoke -- http://localhost:8787/mcp/<MCP_PATH_SECRET>
```

## Claude / ChatGPT 연결

두 서비스 모두 **공개 HTTPS 주소**가 필요합니다. 로컬 개발 중에는 터널을 씁니다.

```bash
cloudflared tunnel --url http://localhost:8787
```

연결 URL은 `https://<터널 주소>/mcp/<MCP_PATH_SECRET>` 입니다.

- **Claude** (Pro/Max): 설정 → 커넥터 → 커스텀 커넥터 추가 → URL 입력, 인증 "No sign in"
- **ChatGPT**: Plugins → `+` → *Add custom MCP server* → URL 입력, 인증 없음
  (요금제에 따라 커스텀 MCP 서버 추가가 제한될 수 있음)

인증은 비밀 경로 하나뿐이므로 URL을 공유하지 마세요. 도구는 모두 읽기 전용입니다.

## 데이터 출처와 고지

- Battle data provided by [Pokemon Champions Battle Data](https://championsbattledata.com/).
  [API 규칙](https://championsbattledata.com/api-rules/)에 따라 응답은 메모리에만 캐시하며 원본을 저장·재배포하지 않습니다.
- 한국어 이름: [PokeAPI](https://github.com/PokeAPI/pokeapi)
- 데미지 계산: [@smogon/calc](https://github.com/smogon/damage-calc) (MIT)
- Pokémon 및 관련 명칭·이미지의 권리는 The Pokémon Company, Nintendo, Creatures, GAME FREAK에 있습니다.
  본 프로젝트는 비공식 팬 프로젝트이며 이들과 관련이 없습니다.
