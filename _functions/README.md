# Firebase 예약 중복 상태 자동화

구현은 준비되어 있지만 운영 Functions 배포 권한이 없어 아직 활성화하지 않았습니다.
GitHub Pages 정적 파일 배포만으로 이 서버 함수가 실행되지는 않습니다.

- `cancelSupersededReservations`: 신규 예약이 만들어지면 같은 한국 날짜·이름·연락처의 이전 신청을 `예약중복취소`로 변경합니다. 이벤트가 중복되거나 역순으로 도착해도 DB의 실제 최신 신청은 보존합니다.
- `updateLatestReservationStatus`: 등록된 관리자만 호출할 수 있고, 트랜잭션에서 최신 신청인지 다시 확인한 뒤 상태를 변경합니다. 이전 신청의 변경 요청은 거부합니다.
- 원본 `createdAt`은 유지합니다. 상태 변경 전후는 이름·연락처를 제외한 감사 기록에 보관합니다.
- 기존 데이터를 전체 순회하여 일괄 변경하지 않습니다. 신규 접수 이벤트 또는 최신 상태 변경에 해당하는 동일인·동일 날짜만 처리합니다.

## 권한 연결 후 배포

기존 프로젝트 `rapigenhc-event`의 Functions 배포 권한이 있는 계정으로 Firebase CLI에 로그인해야 합니다. 프로젝트가 이미 Blaze 요금제인지 확인해야 하며, 요금제 변경은 자동으로 수행하지 않습니다. 현재 계정으로는 과금 연결 여부도 확인할 수 없었습니다.

```sh
firebase login
npm --prefix _functions ci
firebase deploy --project rapigenhc-event --only functions:reservation-duplicates
```

실제 Firestore 위치와 서비스 계정 권한을 확인하고 배포 전 `index.cjs`의 지역(`asia-northeast3`)을 맞춥니다. 기존 Firestore 보안 규칙은 덮어쓰지 않습니다.

함수 배포가 성공하면 백오피스 상태 저장을 Firebase Functions SDK의 `httpsCallable(getFunctions(app, 'asia-northeast3'), 'updateLatestReservationStatus')({ id, status })`로 연결하고 정적 파일을 다시 배포합니다. 함수가 없는 상태에서 기존 상태 저장 기능을 끊지 않도록 클라이언트 연결은 아직 전환하지 않았습니다.

## 로컬 확인

`node --test _functions/policy.test.cjs`는 가상 신청만 사용하여 3회 접수, 이전 2건 취소, 날짜·이름·연락처 구분, 이벤트 역순·중복, 나노초 순서를 검증합니다. 실제 DB나 메일에 연결하지 않습니다.
