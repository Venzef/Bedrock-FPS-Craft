# K/D/A 점수판 구현 — 1.1.25

## 설계와 변경 파일

- `src/scoreboard/ledger.ts`: 경기 누적 K/D/A, 참가 순서, 피해자 생명별 기여, 순위, 뷰어별 스냅샷. 저장 스키마 변경 없이 런타임에 보관한다. `recover()`가 진행 중 경기를 로비로 되돌리는 기존 정책에 맞춰 복구 시 초기화한다.
- `src/scoreboard/damage.ts`, `src/minecraft-combat-adapter.ts`, `src/combat-execution.ts`: 총기·칼의 실제 체력 감소를 한 번만 집계한다. 총기의 추가 체력 보정을 포함하며, 해당 호출 안의 native hurt 이벤트는 중복 집계하지 않는다. 동기 사망 콜백은 피해 기록 이후 처리한다. 일반 hurt는 전투 모듈의 피해 복구 판정을 통과한 경우에만 기록한다. 낙사 등 환경사는 최근 총탄 기록만으로 킬을 얻지 않는다.
- `src/game.ts`: 팀 선택 시 원장 등록과 아이템 지급, 핫바 선택 이벤트·매 틱 HUD 갱신, 사망·연결 해제·라운드 종료·경기 초기화 연동. 연결 해제는 핵심 플레이어 레코드 보존과 무관하게 점수판 통계와 공격자/피해자 기여 관계를 제거한다.
- `src/inventory.ts`, `src/utils.ts`, `behavior_pack/items/scoreboard.json`: 4번 슬롯, `slot` 잠금, `keepOnDeath`, 최대 스택 1. 사용·소모 컴포넌트 없음. 경기 결과 표시의 200틱 대기까지 유지하고 새 경기 초기화에서 회수한다.
- `src/scoreboard/wire.ts`, `tools/generate-scoreboard.mjs`, `resource_pack/ui/hud_elements/permanents/scoreboard.json`: 기존 TMR 202바이트 뒤에 선택적으로 추가하는 488바이트 확장. 프로토콜 상세는 `HUD_PROTOCOL.md` 참조.
- `resource_pack/ui/hud_screen.json`, `_ui_defs.json`, 아이템 아틀라스, 한국어·영어 번역, 점수판/단색 픽셀 텍스처: 중앙 반투명 검정, CT 파랑/T 주황, 고정 팀 아이콘, 자기 행 강조·사망 행 감광. 94% 화면 폭/최대 760 UI 단위, 높이 58%/최대 190 단위.
- `package.json`, lockfile, BP/RP manifests: 버전 1.1.25. 패키징에 UI 생성과 중첩 ZIP 내용 검증을 포함한다.

어시스트는 직접 킬러를 제외한 적대 피해 기여자 중 최고 누적 피해 한 명에게 지급한다. 동률은 해당 피해자를 먼저 타격한 순서로 결정한다. 환경사에도 유효한 적대 기여가 남아 있으면 이 규칙을 적용하며 K는 지급하지 않는다. 라운드 종료 때 기여만 비우고, ROUND_END에서 새로 발생한 피해/사망은 기존 경기 처리 규칙대로 반영한다.

## 자동 검증

- `npm.cmd run check`: TypeScript 빌드와 기존/추가 테스트 전체.
- `tests/scoreboard.test.ts`: 통계·정렬·역할 교대·삭제·UTF-8·개인 자금 공개·피해 보정 순서.
- `tests/scoreboard-integration.test.ts`: 실제 Game/어댑터 코드를 모의 Minecraft API에서 실행. 지급·sanitize·무기 동기화·사망/리스폰·관전자·슬롯 전환·결과 대기·회수·재참가·피해 보정 및 차단 확인.
- `tests/scoreboard-assets.test.ts`: JSON UI 등록·레이어·행 오프셋·자금 열 분리·언어·아이템·버전·생성 재현성.
- `npm.cmd run package`: UI 재생성, TS 빌드, mcaddon 생성, `verify:scoreboard-package` 자동 실행. 새 파일과 기존 HUD 25개를 실제 중첩 mcpack에서 읽어 현재 빌드와 바이트 단위 비교한다.

## Minecraft에서 수동 확인할 항목

모의 API 테스트는 실제 Bedrock JSON UI 렌더링과 기기 입력을 검증하지 않는다. 아래 항목은 실제 클라이언트에서 확인해야 한다.

- [ ] 1:1, 5:5의 CT 좌측/T 우측, 중앙 점수, 빈 행, K/D/A 정렬.
- [ ] 각 클라이언트 본인 행 강조 및 아군 자금만 표시.
- [ ] 한국어/영어, 긴 이름·한글 이름, 16:9·좁은 화면·모바일 GUI scale에서 잘림.
- [ ] 생존/사망/관전에서 4번 슬롯 선택 및 다른 슬롯 선택 시 즉시 닫힘. 특히 Bedrock 관전자 모드의 기기별 핫바 입력 확인.
- [ ] 하프타임 이동 시 누적 K/D/A 유지, 경기 결과 표시 종료 후 아이템 회수.
- [ ] 점수판 뒤 월드·상단 HUD·무기 HUD·킬 로그·이벤트 배너 렌더링.

## 확인한 API 근거

- [Mojang HUD 원본](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/ui/hud_screen.json): HUD root 및 Title factory의 구성 참고.
- [Microsoft ItemStack](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/ScriptAPI/minecraft/server/ItemStack.md): 아이템 잠금·사망 후 유지 API 참고. 최종 빌드는 설치된 `@minecraft/server` 2.3.0 타입 정의를 기준으로 검증한다.
