# Bomb Defusal for Minecraft Bedrock

Minecraft Bedrock 로컬 월드, Realm, BDS에서 동작하는 최대 5대5 MR8 폭파전 애드온입니다. 최소 1대1부터 시작하며 7라운드 후 진영을 교대하고 먼저 8점을 얻은 참가 집단이 승리합니다.

바닐라 장비 경제, 두 경기장, 폭탄 설치·해체, 팀 선택, 맵 투표와 고정 길이 JSON UI HUD를 제공합니다. 상단 점수판은 Title, 개인 무기·탄약·목표 진행률은 `FCAB` ActionBar 데이터 버스로 독립 전송합니다.

## 주요 경기 동작

- 폭탄 설치·해체를 위해 아이템 사용을 유지하는 동안 전후좌우 이동과 점프가 잠기고 웅크리기와 카메라 회전은 유지됩니다. 사용 중단·조준 이탈·거리 이탈·무기 전환·사망 시 취소되며, 피해만으로는 취소되지 않습니다.
- 해제 키트는 인벤토리 아이템이 아닌 플레이어별 패시브 장비이며 해제 시작 시 5초 또는 10초 duration을 확정합니다.
- 구매용 에메랄드는 Buy Phase마다 지급되고, Buy Phase 종료 시 열린 상점 UI와 인벤토리·바닥의 에메랄드가 함께 정리됩니다.
- T가 CT 전멸로 승리한 경우 7초의 라운드 종료 구간에도 폭탄을 설치할 수 있습니다. 이미 확정된 점수·보상·종료 타이머는 바뀌지 않습니다.

```powershell
npm.cmd install
npm.cmd run check
npm.cmd run package
```

설치와 운영 방법은 [docs/INSTALL.md](docs/INSTALL.md), HUD 규격은 [docs/HUD_PROTOCOL.md](docs/HUD_PROTOCOL.md), 상점 계약은 [docs/SHOP_SYSTEM.md](docs/SHOP_SYSTEM.md), Kill Log 구조와 후속 작업은 [docs/KILL_LOG.md](docs/KILL_LOG.md), 라운드 승패·성취 조건은 [docs/ROUND_RESULT_RULES.md](docs/ROUND_RESULT_RULES.md)를 참고합니다.
