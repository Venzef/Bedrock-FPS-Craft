# JSON UI HUD 문자열 프로토콜

HUD는 서로 독립적인 두 전송 채널을 사용한다. 상단 점수판은 Title, 개인 무기·탄약·목표 진행률은 ActionBar로 전송하며 Resource Pack JSON UI가 두 고정 문자열을 파싱한다.

## 상단 점수판: Title

Behavior Pack은 `onScreenDisplay.setTitle()`로 고정 길이 문자열을 보낸다.

```text
TMRxxxxxAaDd + PlayerSlot × 10
```

- 헤더 12글자, 슬롯 19글자 × 10, 전체 202글자
- 일반 표시 영역: `mm:ss`
- 설치 완료 wire 토큰: `BPLNT`
- 해체 성공 후 라운드 종료 wire 토큰: `BDEFS`
- `A`: 현재 T/Attacker 역할 점수
- `D`: 현재 CT/Defender 역할 점수
- 슬롯: `PLA|PLD|PLN` + 16글자 이름 영역

RP는 `BPLNT`와 `BDEFS`를 감지해 각각 정적 `` 및 `` 문자를 표시한다. 멀티바이트 문자는 wire 헤더에 직접 넣지 않는다.

이름 영역은 UTF-8 기준 최대 16바이트로 자르고 남은 바이트를 comma로 채운다.

슬롯 시작 인덱스는 `12, 31, 50, 69, 88, 107, 126, 145, 164, 183`이다.

점수판 생명주기는 기존 규칙을 유지한다. `FREEZE`부터 `ROUND_END`까지 표시하고 `MATCH_END` 진입 시 즉시 지운다.

## 플레이어 슬롯 아이콘

HUD는 클라이언트의 로그인·스킨 캐시 상태와 무관하게 같은 결과를 내도록 `players_collection`의 동적 얼굴을 사용하지 않는다. `PLA`, `PLD`, `PLN` 상태만 읽어 Attacker/T와 Defender/CT의 RP 소유 고정 portrait를 표시한다. `PLD`는 portrait 위에 barrier를 겹치고 `PLN`은 barrier만 표시한다. 실제 플레이어별 스킨 얼굴은 표시하지 않는다.

## 개인 HUD: ActionBar 데이터 버스

ActionBar는 화면에 원문을 표시하는 메시지 영역이 아니라 JSON UI 전용 데이터 버스다. 일반 ActionBar 메시지는 허용하지 않으며 바닐라 ActionBar 컨트롤은 항상 숨긴다. `PlayerHudComposer`만 `setActionBar()`를 호출하고 무기·탄약·설치·해제 시스템은 상태만 제공한다.

RP의 `hud_actionbar_text_factory`는 각 이벤트의 원문을 `$actionbar_text` 변수로 전달한다. 구분자, 칼·폭탄 대시, 설치 HUD, 해제 HUD와 각 탄약값 라벨은 factory의 직접 대상이다. 각 대상은 이를 로컬 `"$atext": "$actionbar_text"`로 복사하고 `visible`에서 파싱한다. 총기는 `W0` 접두사 한 번으로 판정한다. 탄창·예비탄 숫자는 동적 `text` 식이나 한 글자 자리 선택을 사용하지 않는다. 실제 도달 가능한 탄창과 예비탄 wire 값마다 정적 라벨을 만들고, `Axxx` 또는 `Rxxx` 전체 토큰이 일치하는 라벨 하나만 표시한다. wire는 3자리를 유지하지만 화면의 라벨 text는 선행 0 없는 일반 10진수다. 무기 집합 문자열 제거, 다중 `or`, 런타임 앞자리 0 제거 분기는 사용하지 않는다. factory 변수를 `view` binding의 source로 사용하지 않으며, Title용 global binding인 `#hud_title_text_string` 방식이나 존재하지 않는 `#hud_actionbar_text_string`도 사용하지 않는다.

<!-- FCAB:GENERATED:START -->
```text
FCABW04A030R120I2G07
```

정확히 20바이트인 ASCII 프레임이다.

| 범위 | 형식 | 의미 |
| --- | --- | --- |
| 0–3 | `FCAB` | 버전 없는 고정 프로토콜 식별자 |
| 4–6 | `Wxx` | 현재 장비 코드 |
| 7–10 | `A000` | 현재 탄창 `000–999` |
| 11–14 | `R000` | 예비탄 `000–999` |
| 15–16 | `I0` | 없음, 설치, 일반 해제, 키트 해제 코드 |
| 17–19 | `G00` | 진행 글리프 인덱스 `00–20` |

장비 코드는 총기 `W00`, `W02`, `W03`, `W04`, `W05`, 칼 `W14`, 폭탄 `WFF`, 숨김 `WNN`이다. 실제 도달 가능한 탄창은 `0–30`, 예비탄은 `0–120`이며 칼·폭탄·숨김 상태는 탄약을 0으로 만든다.

interaction 코드는 `I0` 없음, `I1` 설치, `I2` 일반 해제(10초), `I3` 키트 해제(5초)다. `G00`–`G19`는 진행 중이며 `G20`은 서버가 성공을 확정한 뒤에만 사용한다. 설치 시간은 3초다.
<!-- FCAB:GENERATED:END -->

weapon HUD는 우측 하단 핫바 위, plant/defuse HUD는 조준점 아래 중앙에 배치한다. 모바일은 조작 버튼을 피하는 별도 `$offset`을 사용한다. 해제 중에도 weapon HUD의 위치·크기·색상은 바꾸지 않으며 서버의 현재 탄창과 예비탄을 계속 반영한다.

프레임 값이 바뀌면 즉시 보내고, 값이 같아도 20틱마다 heartbeat를 보낸다. 한 플레이어에게 한 틱에 최대 한 번만 전송한다. `MATCH_END`에는 `WNN` 비활성 FCAB 프레임을 한 번 보내 마지막 탄약·상호작용 상태를 명시적으로 무효화한 뒤 heartbeat를 중단한다.

## 변경 체크리스트

- 헤더 12바이트, 표시 영역 5바이트, 슬롯 19바이트, 전체 202바이트인가
- 점수가 `0~8` 한 자리인가
- RP substring 길이와 `$name_at`이 BP와 일치하는가
- FCAB 계약과 생성된 RP JSON UI·문서 projection이 일치하는가
- ActionBar 프레임이 ASCII 20바이트이고 `FCAB`로 시작하는가
- 프레임 변경 즉시 전송과 20틱 heartbeat가 단일 합성기를 통하는가
- `G20`이 성공 확정 후에만 10틱 유지되는가
- 바닐라 ActionBar 원문이 항상 숨겨지는가
- ActionBar JSON UI에 `bindings`가 없고 각 렌더러가 factory 직접 대상으로서 로컬 `$atext`로 `visible`을 계산하는가
- 총기 렌더러가 단일 `W0` 접두사 비교를 사용하고 도달 가능한 모든 `Axxx`·`Rxxx` 전체 토큰을 선행 0 없는 정적 숫자 라벨의 직접 factory 대상으로 표시하는가

## 선택형 K/D/A 점수판 확장 (1.1.25)

`formatHudTitle()`의 TMR 프레임은 계속 정확히 202바이트다. 점수판 아이템을 선택한 클라이언트에게만 그 뒤에 488바이트 `SB1` 확장을 붙인다. 기존 TMR 필드의 위치와 ActionBar FCAB 20바이트는 바뀌지 않는다. 점수판을 숨길 때는 즉시 기존 Title 프레임만 보낸다. 로비·투표·경기 결과 대기 중에는 202바이트 공백을 접두부로 사용하므로 기존 상단 HUD는 숨겨진 채 점수판만 표시할 수 있다.

| 확장 내부 바이트 | 필드 |
| --- | --- |
| 0–2 | `SB1` |
| 3 | 뷰어의 아군 역할: `C` 또는 `T` |
| 4–5 / 6–7 | CT / T 라운드 점수 |
| 8–247 | CT 5행, 행당 48바이트 |
| 248–487 | T 5행, 행당 48바이트 |

| 행 내부 바이트 | 필드 |
| --- | --- |
| 0 | `N` 빈 행, `A` 생존, `D` 사망, `S` 본인 생존, `X` 본인 사망 |
| 1 | 팀 내 순위 1–5 |
| 2–33 | UTF-8 이름 32바이트, 코드 포인트 단위 절단·공백 패딩 |
| 34–36 / 37–39 / 40–42 | K / D / A, 왼쪽 공백 패딩 |
| 43–47 | 아군 자금 0–10000; 적군이면 항상 공백 5개 |

빈 행은 `N` 뒤 공백 47개다. 이름의 제어 문자와 Minecraft 서식 코드는 제거한다. 인코더는 입력 객체에 상대 자금이 실수로 포함되어도 전송에서 제거한다. UI는 아군 여부에 따라 서로 다른 열 배치를 사용하며 상대 패널에는 자금 헤더와 값이 표시되지 않는다.

`tools/generate-scoreboard.mjs`가 wire 계약에서 행 오프셋, JSON UI와 전용 픽셀 아이콘을 생성한다. `ui/hud_elements/permanents/scoreboard.json`은 HUD 루트의 독립적인 layer 100 패널이며, 표시 전환 애니메이션이 없다. 변경 후 `npm.cmd run generate:scoreboard`를 실행한다.
