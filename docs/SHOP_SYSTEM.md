# CS 스타일 상점 규약

현재 프로젝트의 경제·구매 정책을 유지하면서 ActionForm을 `fps_shop` JSON UI로 렌더링한다.

## UI 계약

- ActionForm title: `fps_shop:main`
- 구매 가능 버튼: `BUYABLE:<상품명>`
- 구매 불가 버튼: `LOCKED:<상품명>`
- 사용하지 않는 고정 슬롯: `HIDDEN:`
- `server_form.json`은 `fps_shop:` title만 `fps_shop.shop_root`로 보내고 다른 ActionForm과 ModalForm은 바닐라 화면을 유지한다.
- `main_screen_content.controls`를 재정의하지 않는다. 바닐라 server-form factory를 유지한 채 `modifications/insert_back`으로 상점 전용 factory를 추가한다.
- 구매 후 다음 tick에 상점을 다시 열어 최신 잔액과 구매 가능 색상을 반영한다.

## 고정 슬롯

| UI index | 분류 | 상품 | 가격 | Texture |
|---:|---|---|---:|---|
| 0 | Pistol | USP | 500 | `textures/ui/shop/weapons/usp` |
| 5 | SMG | UMP | 1500 | `textures/ui/shop/weapons/ump` |
| 9 | Rifle | AK47 | 2800 | `textures/ui/shop/weapons/akr` |
| 13 | Heavy | Bulldog | 2000 | `textures/ui/shop/weapons/bulldog` |
| 17 | Sniper | AWP | 4500 | `textures/ui/shop/weapons/awm` |
| 21 | Equipment | Armor | 600 | `textures/ui/shop/equipment/armor` |
| 22 | Equipment | Armor + Helmet | 1000 | `textures/ui/shop/equipment/armor_helmet` |

나머지 20개 슬롯은 ActionForm index 정합성을 위해 데이터에는 유지하지만 JSON UI에서는 숨긴다.

## 방어구 규칙

- `Armor`는 철 흉갑만 장착한다.
- `Armor + Helmet`은 철 흉갑과 철 투구를 장착한다.
- 방어구가 없는 상태에서 각 상품을 구매하면 600 또는 1000을 차감한다.
- `Armor` 보유자가 `Armor + Helmet`으로 업그레이드하면 차액 400만 차감한다.
- 이미 보유한 방어구 단계 또는 그보다 낮은 단계는 다시 구매할 수 없다.

## 거래 안전 규칙

구매 시 현재 매치 상태의 `player.money`를 다시 사용하고 다음 조건을 모두 재검증한다.

- Buy Phase(`FREEZE`)
- 같은 라운드와 같은 매치 상태
- 연결·참가·생존 상태
- 현재 역할의 구매 구역

무기·방어구·인벤토리 변경은 구매 전 snapshot을 기준으로 실패 시 복원한다. 구매 시간 종료 시 열린 상점을 닫고 상점 열기 아이템을 제거한다.
