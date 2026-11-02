# lesson-dashboard

수강 현황 대시보드. 노션 API(수강 기수, 수업기록, 학생 급여정보)를 서버에서 읽어 월별·주별 학생 수와 수업 시간 그래프를 보여 줍니다. Claude 없이 Cloud Run에서 동작합니다.

## 구조
- `server.js` HTTP 서버, 키 인증, 메모리 캐시(기본 10분)
- `lib/notion.js` 노션 API 호출(페이지네이션·재시도), `lib/load.js` 세 DB 읽기, `lib/compute.js` 지표 계산
- `public/index.html` 화면(d3, 월/주 전환, 확대·이동)

## 계산 규칙
- 유효 수업: 변동유형(이전 이름 특이사항)에 딜레이·당결·전달사항이 없는 기록(보강·연속 포함). 수업일은 UTC로 오므로 +9시간(KST).
- 과거 인원: 수강 기수의 시작일~종료일(종료일 없음=진행 중). 다음 달(주)부터는 예정 수업이 있는 학생 수(점선).
- 학원: 수업기록 '급여 연결'(이전 이름 연결 정보) → 급여정보 '학원 이름'.
- 진행 중 표: 열린 기수 학생의 '진행 중' 급여정보 주당시간 합, 월=×4.

## 환경 변수
`NOTION_TOKEN`(필수), `DASHBOARD_KEY`(필수, 16자 이상), `CACHE_TTL_SECONDS`, `DS_TENURE`/`DS_LESSON`/`DS_PAY`(선택).

## 열기
`https://<서비스 주소>/?key=<DASHBOARD_KEY>` 로 한 번 열면 쿠키에 저장되고 주소에서 키가 지워집니다.
노션 북마크에는 키가 붙은 주소를 넣어 두면 됩니다. `/api/refresh`로 캐시를 강제로 갱신하고, 헬스체크는 `/ping`입니다(Cloud Run은 `/healthz`를 앞단에서 가로챕니다).

## 배포
```bash
# 1회: 시크릿 만들기 (토큰은 터미널에 직접 입력)
printf '%s' "$NOTION_TOKEN" | gcloud secrets create NOTION_TOKEN --data-file=-
openssl rand -hex 24 | tr -d '\n' | gcloud secrets create DASHBOARD_KEY --data-file=-

# 배포
gcloud run deploy lesson-dashboard --source . --region asia-northeast3 --allow-unauthenticated \
  --set-secrets NOTION_TOKEN=NOTION_TOKEN:latest,DASHBOARD_KEY=DASHBOARD_KEY:latest
```
Cloud Run 서비스 계정에 Secret Manager 접근자(`roles/secretmanager.secretAccessor`) 권한이 필요합니다.
`cloudbuild.yaml`을 쓰면 GitHub 푸시 때마다 자동 배포됩니다.

## 로컬 확인
`npm test`(계산 규칙 검증). 가짜 노션으로 화면 확인: `node test/fake-notion.js` 후 `NOTION_BASE=http://127.0.0.1:9099 NOTION_TOKEN=x DASHBOARD_KEY=local-test-key-123456 node server.js`.
