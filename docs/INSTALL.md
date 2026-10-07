# 설치 및 운영

## 빌드와 로컬 월드

```powershell
npm.cmd install
npm.cmd run check
npm.cmd run package
```

`release-1.1.23/BombDefusal-1.1.23.mcaddon`을 가져온 뒤 새 평지 월드에서 Behavior Pack과 Resource Pack을 모두 활성화한다. 운영자에게 `fps_admin` 태그를 부여하고 최초 한 번 경기장을 생성한다.

```text
/tag <플레이어> add fps_admin
/scriptevent fps:admin build
/scriptevent fps:admin validate
```

## Realm

로컬에서 팩을 활성화하고 경기장을 생성한 월드를 Realm에 업로드한다. Realm 클라이언트가 Resource Pack을 적용해야 JSON UI HUD가 표시된다.

## Bedrock Dedicated Server

준비된 월드를 BDS의 `worlds` 폴더에 복사하고 `server.properties`의 `level-name`을 맞춘다. 월드의 `world_behavior_packs.json`과 `world_resource_packs.json`이 두 manifest UUID와 버전을 참조하는지 확인한다.

## 관리자 명령

- `/scriptevent fps:admin start`: 맵 투표와 매치 시작
- `/scriptevent fps:admin stop`: 관리자 무승부 종료
- `/scriptevent fps:admin reset`: 매치 상태와 경기 아이템 초기화
- `/scriptevent fps:admin status`: 현재 단계·라운드·점수·맵 출력
- `/scriptevent fps:admin build`: 로비와 두 경기장 생성
- `/scriptevent fps:admin validate`: 맵 정의 검증
- `/scriptevent fps:admin team`: 팀 선택 UI
- `/scriptevent fps:admin shop`: 상점 UI 진단

경기장 생성은 지정 좌표를 덮어쓰므로 새 평지 월드에서만 실행한다.
