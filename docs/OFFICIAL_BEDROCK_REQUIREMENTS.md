# 공식 베드락 API 검증 메모

이번 총기 모드 수정은 다음 공식 Microsoft Learn 문서와 현재 프로젝트의 `@minecraft/server` 2.3.0 타입 정의를 기준으로 구현했다.

## 경기 핫바 고정 레이아웃

- [Container](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable)의 슬롯 인덱스는 0부터 시작한다. 화면에 보이는 핫바는 1번부터 9번까지로 설명하므로, 문서와 코드는 화면 위치와 API 인덱스를 함께 적는다.
- 경기 중 핫바는 다음 레이아웃을 사용한다.

| 화면 기준 | API 슬롯 | 역할 | 상태 및 규칙 |
| --- | ---: | --- | --- |
| 1번 | 0 | 주무기 | 기본 위치 유지, 버리기 허용 |
| 2번 | 1 | 보조무기 | 기본 위치 유지, 버리기 허용 |
| 3번 | 2 | 칼 | 고정, 이동·버리기 불가 |
| 4번 | 3 | 점수판 (`fps:scoreboard`) | 슬롯 고정·사망 후 유지, 선택 중 K/D/A 표시 |
| 5번 | 4 | flash | 현재 미구현, 빈칸 예약 |
| 6번 | 5 | smoke | 현재 미구현, 빈칸 예약 |
| 7번 | 6 | thermite | 현재 미구현, 빈칸 예약 |
| 8번 | 7 | C4 | 버리기 허용; 해제 키트는 인벤토리 아이템이 아닌 패시브 상태 |
| 9번 | 8 | 상점 열기 아이템 | 고정, 이동·버리기 불가 |

- 아이템이 실제로 존재하는 고정 슬롯에는 원칙적으로 [ItemLockMode](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemlockmode?view=minecraft-bedrock-stable)의 `slot`을 적용한다. 단, 아군에게 전달할 수 있어야 하는 C4에는 `none`을 적용한다. 아직 구현되지 않은 전술 슬롯은 아이템을 넣지 않고 주기적으로 비운다.
- 주무기·보조무기와 C4는 공식 `ItemLockMode`에서 이동과 버리기를 분리해 잠글 수 없으므로 `none`을 사용해 버릴 수 있게 한다. 라운드 시작·구매·동기화 시에는 각 고정 슬롯에 다시 배치하고, 정상 아이템 검사는 해당 슬롯 규칙을 유지한다.

## 상점 아이템 슬롯

- [Container](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable)는 `setItem(slot, itemStack?)`가 0부터 시작하는 특정 슬롯에 아이템을 배치한다고 설명한다.
- 같은 문서는 플레이어 인벤토리가 36칸이며 핫바가 9칸이라고 설명한다. 따라서 화면에서 아홉 번째 핫바 칸은 API 슬롯 `8`이다.
- [ItemLockMode](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemlockmode?view=minecraft-bedrock-stable)의 `slot`은 아이템이 해당 슬롯에서 이동·버리기 되지 않도록 하고, `none`은 컨테이너 제한이 없다. 칼·에메랄드·점수판은 `slot`, 주무기·보조무기·C4는 `none`으로 저장한다.
- `ensureItemAtSlot`은 에메랄드가 다른 슬롯에 있더라도 슬롯 `8`로 이동시키고, 중복 에메랄드를 제거하며, 기존 슬롯 아이템은 월드에 돌려준다.
- 해제 키트는 `PlayerMatchState.hasDefuseKit`으로 저장하므로 `ItemStack`, `ItemLockMode`, 핫바 배치 규칙을 사용하지 않는다.

## 총알 엔티티 제거

- [Entity](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable)의 `remove()`는 엔티티를 즉시 제거하며 사망 애니메이션이나 전리품을 발생시키지 않는다고 명시한다.
- 따라서 벽 충돌, 최대 거리·수명 초과, 텔레포트 실패 등 즉시 정리 경로에서는 `kill()` 대신 `remove()`를 호출한다. 플레이어 적중 경로는 피해·사망 사후 이벤트가 처리된 다음 한 틱 뒤 `remove()`를 호출한다.

## 피격 넉백

- 현재 프로젝트 의존성의 `world.afterEvents.entityHurt`는 피해량·피해 원천·피격 엔티티를 제공하지만 넉백을 취소하는 필드를 제공하지 않는다. [EntityHurtAfterEvent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityhurtafterevent?view=minecraft-bedrock-stable)
- 최신 공식 [EntityHurtBeforeEvent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityhurtbeforeevent?view=minecraft-bedrock-stable)도 `cancel`과 `damage`만 제공한다. `cancel`은 피해 이벤트 전체를 취소하며 넉백만 취소하지 않는다.
- [Entity.clearVelocity](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity) 는 현재 속도 전체를 0으로 만드는 API이지 피격으로 생성된 넉백만 구분해 취소하는 API가 아니다. 이동·점프 속도까지 훼손할 수 있고 적용 시점도 보장되지 않으므로 이 요구사항은 안전한 공식 구현이 불가능한 것으로 판단해 코드에 적용하지 않았다.

## 총알 피해와 사망 판정

- [Entity.applyDamage](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable)는 투사체 피해에 `EntityApplyDamageByProjectileOptions`를 사용할 수 있고, 사망 이벤트의 [EntityDamageSource](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entitydamagesource?view=minecraft-bedrock-stable)는 피해 원인 `cause`를 제공한다.
- 총알 피해는 공식 [EntityDamageCause.override](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entitydamagecause?view=minecraft-bedrock-stable)를 사용해 기본 피격 무적 타이머의 영향을 받지 않도록 시도하고, 호출 전후 [EntityHealthComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityhealthcomponent?view=minecraft-bedrock-stable) 차이를 확인한다. 엔진이 일부만 반영했거나 무적 상태로 거부한 잔여 피해는 공식 `EntityAttributeComponent.setCurrentValue`로 즉시 반영한다. 피해 대상별 발사자·무기 정보를 별도로 보존하며, 총알 엔티티는 피해 적용 직후 제거하지 않고 한 틱 뒤 `Entity.remove()`하여 `entityHurt`·`entityDie` 사후 이벤트가 피해를 처리할 시간을 보장한다.

## 라운드·게임 종료 아이템 정리

- 공식 [Entity.remove()](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable)는 엔티티를 즉시 제거하며 사망 애니메이션이나 전리품을 만들지 않는다.
- 라운드 종료 시 `minecraft:item`, `fps:dropped_bomb`, `fps:dropped_weapon`을 모든 기본 차원에서 `remove()`로 정리한다. 매치 종료 시에도 동일한 월드 정리를 수행한 뒤 플레이어 인벤토리·장비의 경기 아이템을 제거한다.
- 설치된 폭탄 엔티티는 포스트 라운드 설치 규칙을 유지하기 위해 일반 바닥 아이템 정리 대상에서 제외하고, 라운드 정리 단계에서 별도로 제거한다.
