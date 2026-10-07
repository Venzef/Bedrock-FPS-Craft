# Kill Log 운영 구조와 후속 구현 가이드

상태: `1.1.4` 기준 운영 연결 완료, 일부 플래그와 투척 무기 연동 보류

이 문서는 현재 Kill Log의 실제 코드 경로와 앞으로 `noScope`, `smokeShot`, `blinded`, 투척 무기 Kill Feed를 추가할 때 지켜야 할 계약을 설명한다. 최초 재사용 가이드와 달리 이 프로젝트의 TypeScript 원본은 `src/killLog`에 있고, 빌드 결과가 `behavior_pack/scripts/killLog`에 생성된다. 생성된 JavaScript를 직접 수정하지 않는다.

## 1. 현재 데이터 흐름

```text
Minecraft Player 상태
  -> MinecraftCombatAdapter.snapshot()
  -> CombatPlayerSnapshot
  -> CombatExecution.tryFire()
  -> ActiveProjectile (발사 순간 metadata 고정)
  -> hitProjectile()
  -> ProjectileHitRecord (피해자별 최근 명중)
  -> resolveDeath()
  -> CombatDeathAttribution
  -> Game.onDeath() / sendKillLog()
  -> createKillLogForKill()
  -> 74글자 프로토콜 생성·검증·파싱
  -> 글리프와 색상이 포함된 채팅 운반 메시지
  -> RP chat_text_grid / 우측 상단 Kill Feed
```

주요 파일:

- `src/combat-execution.ts`: 발사체 수명, 충돌, 최근 명중 기록, 사망 귀속
- `src/minecraft-combat-adapter.ts`: Minecraft 엔티티를 테스트 가능한 전투 스냅샷으로 변환
- `src/game.ts`: 실제 `entityDie` 이벤트, 매치 수신자 필터, Kill Log 발행
- `src/killLog/killLogProtocol.ts`: 74글자 wire protocol
- `src/killLog/killLogGlyphs.ts`: 무기·플래그 글리프, 팀 색상, 표시 문자열
- `src/killLog/killLog.ts`: 게임 팀을 프로토콜 팀으로 변환하고 전체 발행 문자열 조립
- `resource_pack/ui/hud_elements/permanents/kill_log.json`: Kill Feed 렌더러
- `tests/combat-kill-log.test.ts`, `tests/kill-log.test.ts`: 전투 metadata와 표시 계약 회귀 테스트

## 2. 고정 운영 계약

- 팀 wire 값: 공격 역할 `T -> "0"`, 수비 역할 `CT -> "1"`
- 팀 색상: T `§c`, CT `§b`
- 무기와 Kill 플래그 색상: `§r`
- 수신자: `joined && connected`인 현재 매치 참가자. 사망 관전자도 포함한다.
- 환경사, 자살, 팀킬, 비참가자 사망은 Kill Feed를 발행하지 않는다.
- 내부 프로토콜은 `FPSCRAFT:KILLLOG:ADD:` 헤더를 포함한 74글자 고정 포맷이다.
- RP로 보내는 문자열은 내부 프로토콜 자체가 아니라 `FPSCRAFT:KILLLOG:ADD:\n<display>`다.
- 플래그 표시 순서는 `headshot -> jumpShot -> smokeShot -> wallbang -> blinded -> noScope`다.

프로토콜의 필드 위치나 헤더를 바꿀 때는 BP 프로토콜, 표시 생성기, RP prefix 추출 길이와 채팅 필터를 함께 수정한다.

## 3. 현재 구현된 플래그

### headshot

발사체가 피해자와 충돌할 때 `classifyHitBand()` 결과가 `HEAD`이면 기록한다. 발사 시점이 아니라 실제 명중 지점을 기준으로 한다.

### jumpShot

`MinecraftCombatAdapter.snapshot()`이 `Player.isOnGround`를 안전하게 읽는다. API 조회가 예외를 던지면 오탐을 피하기 위해 `true`(지상)로 취급한다.

`CombatExecution.spawnProjectile()`는 발사체를 만드는 순간 `jumpShot = !player.isOnGround`를 `ActiveProjectile`에 저장한다. 이후 킬러가 착지하더라도 값은 바뀌지 않는다. 자동 사격과 산탄은 생성되는 각 발사체가 자신의 발사 순간 값을 가진다. Knife처럼 발사체를 만들지 않는 공격에는 적용하지 않는다.

### wallbang

현재 지원하는 관통 가능 블록(유리, 유리판, 양털)을 실제로 한 번 관통한 발사체가 킬을 만들면 기록한다. 단순히 벽 가까이에서 처치한 경우에는 기록하지 않는다.

### 사망 귀속 유효 범위

`ProjectileHitRecord`는 피해자별 최근 명중 한 건을 보존한다. 사망 시점과 2틱 이내이며 기록된 사수와 실제 킬러가 일치할 때만 플래그와 무기 ID를 사용한다. 오래된 명중 기록이 환경사나 다른 플레이어의 킬을 꾸미면 안 된다. 라운드 정리 시 전투 모듈의 명중 기록과 발사체를 모두 제거한다.

## 4. 보류된 플래그

프로토콜과 RP 글리프는 아래 플래그를 이미 표현할 수 있지만, 판정에 필요한 게임 상태가 아직 없다. 상태 시스템 없이 현재 보유 아이템이나 사망 순간 상태를 보고 추정하지 않는다.

### noScope

권장 의미는 `scoped === true`인 무기를 조준 상태가 아닌 채 발사해 만든 킬이다. 일반 무기의 hip-fire에는 붙이지 않는다.

필요 작업:

1. 조준 시작·종료 입력 또는 애니메이션을 서버가 신뢰할 수 있는 상태로 연결한다.
2. 플레이어별 `isScoped` 상태의 시작, 종료, 무기 교체, 사망, 라운드 정리 규칙을 정의한다.
3. `CombatPlayerSnapshot`에 발사 순간 조준 상태를 제공한다.
4. `ActiveProjectile`에 `noScope`를 저장한다. 판정식은 `weaponDefinition(weaponId).scoped === true && !isScoped`가 권장된다.
5. `ProjectileHitRecord -> CombatDeathAttribution.flags -> KillLogKill.flags`로 전달한다.

조준 상태를 사망 순간에 읽으면 발사 후 조준하거나 해제한 행동 때문에 결과가 바뀌므로 반드시 발사 순간에 고정한다.

### blinded

먼저 플래그의 주체를 확정해야 한다. 권장 의미는 **킬러가 실명된 상태에서 발사한 탄환으로 처치**한 경우다.

필요 작업:

1. Flash 투척 무기와 섬광 노출 판정 시스템을 구현한다.
2. 실명의 시작 tick, 종료 tick, 강도 또는 완전 실명 기준을 플레이어별 상태로 관리한다.
3. `CombatPlayerSnapshot`에 `isBlindedAtShot`을 제공한다.
4. 발사 순간 값을 `ActiveProjectile`에 고정하고 사망 귀속까지 전달한다.
5. 사망·이탈·라운드 전환에서 실명 상태를 정리한다.

Minecraft 기본 `blindness` 효과만 읽을지, 커스텀 Flash 상태를 기준으로 할지 혼용하지 말고 하나의 권위 있는 판정 함수를 둔다.

### smokeShot

먼저 Smoke Shot의 공간 의미를 확정해야 한다. 권장 의미는 **발사 지점부터 최종 명중 지점까지의 탄도 선분이 활성 연막 볼륨을 통과한 킬**이다. 킬러나 피해자가 연막 안에 있다는 조건만으로 대체하면 가장자리 사격에서 결과가 달라진다.

필요 작업:

1. Smoke 투척체, 활성화 tick, 종료 tick, 중심점, 반지름을 갖는 연막 볼륨 레지스트리를 구현한다.
2. 라운드·차원별 활성 볼륨을 조회하는 인터페이스를 만든다.
3. 전투 모듈이 Minecraft 엔티티에 직접 의존하지 않도록 어댑터에 선분-연막 교차 질의를 둔다.
4. 발사체의 이동 구간마다 연막 교차 여부를 누적하거나, 전체 이동 경로를 보존해 명중 시 계산한다.
5. 한 번이라도 교차했다면 `ActiveProjectile.smokeShot = true`로 유지하고 사망 귀속까지 전달한다.
6. 라운드 종료와 매치 정리에서 모든 연막 엔티티·볼륨을 제거한다.

권장 인터페이스 예시:

```ts
interface CombatExecutionAdapter {
  segmentIntersectsActiveSmoke(
    dimensionId: string,
    from: CombatVector3,
    to: CombatVector3,
    nowTick: number,
  ): boolean;
}
```

현재 `CombatPlayerSnapshot`과 `ActiveProjectile`에는 `dimensionId`가 없으므로 연막 구현 시 함께 추가해야 한다.

## 5. 투척 무기 Kill Feed

글리프 레지스트리에는 `W12` HE Grenade와 `W13` Molotov가 예약되어 있지만, 현재 `WeaponId`, `WeaponDefinition`, 인벤토리, 투척 엔티티, 범위 피해 시스템에는 연결되어 있지 않다.

권장 구현 순서:

1. 투척 무기 도메인 모델을 먼저 만든다. 총기의 magazine/reload 모델에 억지로 넣지 말고 일회성 전술 장비 수명주기를 분리한다.
2. 투척 시 생성되는 엔티티에 `ownerId`, Kill Log용 `weaponId`, 생성 tick을 기록한다.
3. 폭발·화염 범위 피해를 적용하기 직전에 피해자별 귀속 기록을 만든다.
4. 여러 피해자가 동시에 죽을 수 있으므로 단일 최근 발사체가 아니라 피해자별 damage attribution을 유지한다.
5. HE는 폭발 순간의 직접 범위 피해, Molotov는 지속 화염의 마지막 유효 소유자와 만료 시간을 명시한다.
6. 자해·팀 피해 정책을 기존 `canDamageTarget()`과 동일하게 적용한다.
7. `resolveDeath()`가 총기 발사체와 투척 피해 기록을 공통 형식으로 소비하도록 일반화한다.
8. `rewardWeaponId`와 Kill Log weapon ID를 분리할 필요가 있는지 결정한다. 투척 무기 보상이 총기와 다르면 명시적 registry를 사용한다.
9. 투척체와 지속 피해 영역은 라운드 정리 시 제거하고 attribution도 만료시킨다.

권장 공통 기록 형태:

```ts
interface DamageAttributionRecord {
  attackerId: string;
  weaponId: KillLogWeaponId;
  tick: number;
  flags: Partial<KillLogFlags>;
}
```

`WeaponId`는 현재 실제 loadout 무기만 나타낸다. W12/W13을 추가할 때 loadout 무기와 Kill Log 표시 ID가 반드시 같은 타입이어야 하는지 먼저 검토한다.

## 6. 변경 시 테스트 기준

최소 회귀 테스트:

- 발사 순간 공중, 명중 전 착지 -> `jumpShot: true`
- 지상 발사, 명중 전 점프 -> `jumpShot: false`
- 조준 발사 후 조준 해제 -> `noScope: false`
- 비조준 AWP 발사 후 조준 -> `noScope: true`
- 실명 중 발사 후 효과 종료 -> `blinded: true`
- 발사 후 실명 -> `blinded: false`
- 탄도가 연막 볼륨을 통과한 킬과 통과하지 않은 킬
- HE 다중 킬의 각 피해자 귀속
- Molotov 소유자 이탈·사망 후 유효 시간 내 귀속 정책
- 팀킬·자살·환경사·만료된 attribution 제외
- 복수 플래그의 고정 표시 순서와 `§r` 색상
- 라운드 정리 후 이전 연막·화염·귀속 기록이 다음 라운드에 남지 않음

검증 명령:

```powershell
npm run check
npm run package
```

패키징 후 `.mcaddon` 안의 BP에 `scripts/killLog/*`, RP에 `kill_log.json`, `glyph_E1.png`, `glyph_E8.png`가 포함되고 두 manifest 버전이 일치하는지 확인한다.

## 7. 후속 작업 체크리스트

- [ ] noScope의 조준 상태 권위 소스와 상태 수명주기 확정
- [ ] blinded의 주체와 Flash 판정 기준 확정
- [ ] smokeShot의 선분-연막 교차 의미 확정
- [ ] 투척 무기 도메인과 총기 도메인의 ID 경계 결정
- [ ] 발사/투척 순간 metadata를 immutable record에 저장
- [ ] 피해자별 attribution TTL과 우선순위 정의
- [ ] 라운드·매치 정리에서 모든 전술 상태 제거
- [ ] 실제 매치 참가자에게만 Kill Feed 발행
- [ ] 프로토콜 74글자와 RP 표시 순서 유지
- [ ] 단위 테스트, 통합 테스트, 실제 Bedrock 월드 테스트 수행
