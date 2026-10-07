# Actionbar JSON UI 리팩토링 근거

확인일: 2026-09-08. 화면 결과를 유지하면서 `resource_pack/ui/actionbar_hud.json`의 반복 선언을 줄이기 위한 조사다.

## 공식 문서에서 확인한 사항

- 자식 컨트롤 이름은 `이름@기본요소` 형태로 상속할 수 있다. `controls`는 자식 요소 목록이다. [Microsoft Learn: UI Element / Controls](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/jsonuireference/examples/jsonuicomponents/ui_element?view=minecraft-bedrock-stable#controls)
- `anchor_from`, `anchor_to`, `offset`, `size`는 배치에 관여한다. `font_size`, `font_scale_factor`, `font_type`, `text_alignment`, `shadow`는 텍스트 표현에 관여하며, `layer`가 클수록 위에 그린다. 이 값과 부모 관계를 보존한다. [Microsoft Learn: UI Element Properties](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/jsonuireference/examples/jsonuicomponents/ui_element?view=minecraft-bedrock-stable#ui-element-properties)
- `variables`는 조건부 변수 선언이며 `requires`는 적용 조건이다. 문서에는 변수 스코프 및 상속 시 복합 속성 병합의 세부 규칙이 충분히 설명되어 있지 않다. [Microsoft Learn: Variables](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/jsonuireference/examples/jsonuicomponents/ui_element?view=minecraft-bedrock-stable#variables)

## 공식 배포 예제로 보완한 사항

- Mojang의 HUD에는 `empty_progress_bar@empty_progress_bar` 등에서 `size`, `layer`, `controls`를 구체적으로 선언하는 상속 사례가 있다. 템플릿과 인스턴스의 정적 속성을 분리하는 방식의 근거로 사용한다. [Mojang: hud_screen.json](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/ui/hud_screen.json)
- 같은 파일의 `hud_actionbar_text_area`는 `factory.name`에 `hud_actionbar_text_factory`를 사용하고, `control_ids.hud_actionbar_text`를 `hud_actionbar_text@hud.hud_actionbar_text`에 연결한다. `hud_actionbar_text` 내부 라벨은 `$actionbar_text`를 사용한다. 현재 프로젝트의 생성 경로와 기존 런타임 표현식을 유지한다. [Mojang: hud_screen.json 원문](https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/ui/hud_screen.json)
- Mojang 공통 UI에는 `$변수|default`, 속성의 변수 참조, `factory.control_ids` 객체를 사용하는 사례가 있다. 사용 가능하다는 근거이며, 이번 정적 중복 제거에 새 변수를 도입해야 한다는 뜻은 아니다. [Mojang: ui_common.json](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/ui/ui_common.json)

## 적용 원칙과 검증 한계

위 근거에 따른 보수적인 설계 판단은 **공통 정적 속성만 기본 컨트롤로 추출하고, 차이는 구체 컨트롤에서 직접 선언**하는 것이다. 기존 변수·바인딩·조건식·factory 식별자·자식 순서와 부모 구조를 그대로 유지한다. 상속에 따른 배열 병합에 의존하지 않도록 기본 템플릿에는 공통 표현 속성만 두는 방식을 우선한다.

검증 시 상속을 펼친 결과를 변경 전 선언과 비교해 크기·위치·폰트·텍스트·색·레이어·조건·자식 순서의 동일성을 확인한다. 이 비교는 정적 구조 검증이며 Minecraft의 실제 렌더링 검증을 대신하지 않는다.

## 적용된 파일 구조

생성 원본은 `tools/generate-actionbar-hud.mjs`다. 수정 후 `npm run generate:actionbar-hud`로 JSON을 재생성한다.

- `magazine_label`, `reserve_label`, `weapon_status_label`: 기존 위치와 반응형 변수 선언, 글꼴 배율과 그림자를 공유한다. 숫자별 인스턴스에는 정적 `text`와 기존 `visible` 식만 남긴다.
- `objective_panel`, `objective_background`, `objective_track`, `objective_label` 계열: 설치·해제 UI의 공통 배치와 표현을 담당한다.
- `objective_fill` 및 `objective_frame_00`–`objective_frame_20`: 막대 표현과 프레임별 너비·조건을 한 번 정의하고 세 가지 진행 UI에서 참조한다.
- `render`의 factory 연결, 실제 렌더링 컨트롤의 이름·부모·순서는 유지한다. 시간 라벨은 기존의 정적 문자열을 계속 사용한다.

생성 JSON은 210,459바이트 / 7,998줄에서 110,953바이트 / 3,321줄로 감소했다. `tests/helpers/actionbar-inheritance.ts`는 이 파일에서 사용하는 정적 상속을 펼치며, 기존 UI 테스트와 수정 전 1.1.21 전체 속성의 정규화 해시를 비교하는 회귀 테스트가 이를 검증한다. 기본 `fc` 참조는 그대로 유지하며 게임의 기본값이나 런타임 식을 테스트 코드에서 추정하지 않는다.
