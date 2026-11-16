# 최초 유입값 유지

`attribution.js`는 모든 공개 페이지의 head에서 먼저 실행해 같은 탭의 최초 `source`, `medium`, `campaign`을 하나의 값 묶음으로 저장합니다. 같은 방문에서 다른 메뉴·새로고침·다른 UTM 링크를 거쳐도 최초 묶음을 덮어쓰거나 서로 다른 방문의 필드를 섞지 않습니다. 이전 유입을 전달받지 않은 새 탭에서 독립 진입하면 새 최초값을 기록합니다.

- 표준 파라미터는 `utm_source`, `utm_medium`, `utm_campaign`입니다. 기존 짧은 이름과 `campain`/`utm_campain`도 읽습니다. 캠페인 대소문자를 바꾸지 않습니다.
- 세션 저장이 차단되면 세션 쿠키와 내부 링크 전달로 보완합니다. 새 탭·두 운영 사이트 간 이동에도 필요한 값을 전달합니다. 외부 사이트·전화·관리자·API·다운로드 링크는 수정하지 않습니다.
- 일반 메뉴 URL에 UTM을 반복해서 붙이지 않아도 예약은 `window.RapigenAttribution.get()`의 최초값을 사용합니다. 기존 저장 키 두 종류도 호환합니다.
- PHP 예약과 Firebase 예약 어댑터·가족 예약·공통 푸터 폼·GA 전환이 같은 값을 사용합니다. 직접 방문은 기존 기본값을 사용하며 GA의 자연 검색 판정을 임의로 덮어쓰지 않습니다.
- 캠페인은 예약 DB·신규 Firebase 가져오기·관리자 응답·엑셀/CSV에 포함됩니다. 표의 유입 채널에 마우스를 올리면 캠페인을 확인할 수 있습니다. 기존 대시보드 지표와 메일 양식은 바꾸지 않습니다.

## 배포 및 데이터 영향

1. PHP(`rapigenhc-event`) 레포지터리의 기존 운영 코드가 실행되는 상태에서 `php scripts/migrate-reservation-campaign.php`를 실행합니다. 이 스크립트는 `campaign VARCHAR(200) DEFAULT 'none'` 컬럼이 없을 때만 추가하며, 기존 값·상태·타임스탬프를 변경하지 않습니다.
2. `CAMPAIGN_SCHEMA_READY=true`를 확인한 뒤 프론트·API 변경을 배포합니다. DB 비밀값·계정·CORS·인증·접수 제한은 변경하지 않습니다. 과거에 저장하지 못한 캠페인은 새로 추정하거나 기존 고객 데이터에 덮어쓰지 않습니다.
3. 새 시크릿 창에서 UTM URL로 진입한 뒤 메뉴를 이동하여 예약 전달값을 확인합니다. 로컬 테스트는 가상 신청만 사용하고 운영 예약·메일·Firebase·GA 전송을 하지 않습니다.

변경 대상은 공개 예약/추적 코드, 예약 캠페인 저장, 기존 내보내기와 툴팁입니다. 동일한 요청 재시도는 기존처럼 한 번만 저장하고, 캠페인이 다른 실제 새 신청은 구분합니다. 이전 버전 클라이언트가 캠페인을 보내지 않아도 기존 방식으로 접수됩니다.

## 검증

```sh
node --test test/attribution.test.cjs test/reservation-table.test.mjs
node test/reservation-client.cjs script.js
RAPIGEN_TEST_SOCKET=/private/tmp/프로젝트.sock RAPIGEN_TEST_DB_USER=로컬사용자 php test/reservation-attribution.php
```

추가로 실제 페이지를 네 번 이동해 예약 제출까지 실행하는 격리 브라우저 검증과 기존 중복 상태·묶음 메일 테스트를 수행합니다.
