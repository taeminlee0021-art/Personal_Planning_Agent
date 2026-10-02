# Personal Planning Agent frontend

Phase 6의 반응형 Next.js 웹 화면입니다. 전체 설치·실행 방법과 제품 범위는 루트의 `README.md`와 `AGENTS.md`를 따릅니다.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

기본적으로 `http://127.0.0.1:8000`의 FastAPI 서버를 사용합니다.

## Cloudflare Workers 배포 (ChatGPT Sites와 별개)

`npm run deploy:cloudflare`는 기존 Sites 빌드(`scripts/run-framework.mjs build`)를 그대로 실행한 뒤,
`dist/server/wrangler.json`은 건드리지 않고 같은 폴더에 `wrangler.cloudflare.json`을 만들어
Worker `personal-planning-agent`로 배포합니다. Sites 설정(`vite.config.ts`, `.openai/hosting.json`)은 사용하지 않습니다.

```powershell
# frontend 폴더에서 실행
npx wrangler login
$env:CF_BACKEND_API_URL = "https://<백엔드 호스트>"; npm run deploy:cloudflare
npm run deploy:cloudflare -- --skip-build   # 현재 dist/ 재사용
npm run deploy:cloudflare -- --dry-run      # 업로드 없이 검증
```

순서를 반드시 지키세요: **배포(토큰 없음) → Cloudflare Access 적용 → Access 동작 확인 → 토큰 입력**.
토큰은 코드·설정·README에 넣지 않고, Access 확인 뒤에만 입력합니다.

```powershell
npx wrangler secret put APP_INTERNAL_TOKEN --name personal-planning-agent
```

Access는 Cloudflare 대시보드 → Workers & Pages → `personal-planning-agent` → 상단 **Access** 탭
(설정 탭의 "도메인 및 경로"가 아님) → 보호 범위 **All traffic** → 정책 **Cloudflare account** → Apply.
스크립트는 `preview_urls=false`로 배포해 미리보기 URL이 Access를 우회하지 않게 합니다.

### 문제 해결

- `npx`/`npm`이 인식되지 않음(설치 직후): 터미널이 이전 PATH를 사용 중.
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
  또는 터미널 재시작.
- `npx.ps1을 실행할 수 없으므로…`: PowerShell 실행 정책. `npx.cmd`/`npm.cmd`로 실행하거나
  `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.
- `Could not read package.json`: 저장소 루트가 아니라 `frontend` 폴더에서 실행.
- `You need to register a workers.dev subdomain`: 비대화형 실행에서는 질문에 자동으로 no가 들어감.
  대시보드에서 하위 도메인을 등록하거나 API로 등록한 뒤 `npm run deploy:cloudflare -- --skip-build`.
- Workers API `code 10034`: 계정 이메일 인증이 안 됨.
- `wrangler secret put`을 배포 전에 실행하면 빈 Worker가 먼저 생김 → `npx wrangler secret delete APP_INTERNAL_TOKEN --name personal-planning-agent`
  로 지우고 배포 → Access → 토큰 순서로 다시 진행.
- wrangler OAuth 토큰에는 Access(Zero Trust) 권한이 없음(403) → Access는 대시보드에서 설정.
- 화면에 `인증 필요`/401: 입력한 토큰이 백엔드 값과 다름 → 같은 명령으로 다시 입력.
- Cloudflare 오류 1102: 무료 플랜 CPU 한도 초과.
