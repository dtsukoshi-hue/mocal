# RLS Policy レビュー チェックリスト

> Supabase Row Level Security (RLS) ポリシーの設計・追加・変更時に**必ず確認する**。
> F-18 (`orders_public_select_by_uuid USING (true)` による全件漏洩) 同類の事故を防ぐため作成。
> このリストは AGENTS.md「Supabase RLS の罠」と対になる。

## 大原則

1. **anon は何も読めない・書けないを default**にする。例外（公開テーブル）は明示する
2. **`USING (true)` は SELECT で原則禁止**。書く場合は何故安全かをコメントで説明する
3. **`GRANT ALL ... TO anon` は禁止**。必要なものだけ最小限を `GRANT INSERT, ...` で
4. **RLS の挙動は REST API と Realtime で異なる**。両方に効くポリシー設計か検証する
5. **新規ポリシーには必ず anon 視点の test を `tests/security/` に追加**する

---

## 新規 / 変更ポリシー追加時のチェックリスト

### A. 設計段階

- [ ] テーブルは「公開 / 認証必須 / 内部のみ」のどれか明示した
- [ ] anon と authenticated の挙動を分けて記述した
- [ ] Realtime を使う場合、anon のチャネル subscribe 時の RLS 通過条件を確認した
- [ ] `USING (true)` を使うか？ → 使うなら下記「⚠️ `USING (true)` を書く前の確認」へ
- [ ] `GRANT ALL` を書くか？ → 書かない。必要なものだけ列挙する

### B. 実装段階

- [ ] 新規テーブル作成時に `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` を入れた
- [ ] RLS 有効化していてもポリシー無しだと全拒否なので、必要なアクセスのポリシーを書いた
- [ ] `anon` への `GRANT` は必要最小限（INSERT のみ等）
- [ ] `authenticated` への GRANT もパス毎にレビュー

### C. テスト

- [ ] `tests/security/anon-rest-access.test.ts` に
  - **拒否されるべき** SELECT のテストを追加（`expect(rows.length).toBe(0)`）
  - **許可されるべき** SELECT のテストを追加（公開テーブル）
- [ ] Realtime チャネルを使うなら、anon で subscribe したときに自分以外の行を受け取らないテストも追加候補（要 fixture）
- [ ] `npm run test:security` を**実行して通る**ことを確認

### D. レビュー / コミット

- [ ] migration file が `supabase/migrations/<timestamp>_*.sql` で生成された
- [ ] commit message に RLS 変更の意図と影響範囲を記載
- [ ] 適用前後で `npm run test:security` の結果を比較した

---

## ⚠️ `USING (true)` を書く前の確認

`USING (true)` は強力で危険。書く前に以下を**全部**満たすこと:

1. **そのテーブルは「100% 公開して良い」か？**
   - 例: `stores` の `id, name, slug, area, cuisine_type, cover_url` は公開して良い
   - 例: `orders` は**ダメ**（顧客 PII を含む）
2. **将来そこに PII 列が追加される可能性はないか？**
   - ない → 公開維持で OK
   - ある → 列単位の GRANT で絞るか、view を作って間接化する
3. **anon GRANT で SELECT を許可することと整合するか？**
   - `GRANT SELECT ON x TO anon;` + `USING (true)` で「完全公開テーブル」になる
   - これが意図したものか
4. **コード側に security モデルの依存はないか？**
   - 「UUID を知ってる人だけ読める」のような設計は **`USING (true)` では実現できない** → JWT 等の追加 primitive が必要

---

## 良いパターン例

### 公開テーブル（明示的に全公開）
```sql
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_public_read" ON public.stores
  FOR SELECT USING (true);
GRANT SELECT ON public.stores TO anon, authenticated;
-- 注: INSERT/UPDATE/DELETE は service_role のみ。anon に GRANT しない。
```

### 認証必須・自分の行のみ
```sql
CREATE POLICY "profiles_own_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
-- anon は SELECT 拒否、authenticated は自分の id の行のみ
```

### 店舗メンバー専用（JOIN チェック）
```sql
CREATE POLICY "orders_store_member_select" ON public.orders
  FOR SELECT USING (
    store_id IN (
      SELECT store_id FROM public.store_members
      WHERE user_id = auth.uid()
    )
  );
```

### bearer token モデル（JWT claim による proof-of-access）
```sql
-- A+ 実装で導入予定
CREATE POLICY "orders_access_token_select" ON public.orders
  FOR SELECT USING (
    access_token = (auth.jwt() ->> 'access_token')
    OR auth.uid() = user_id  -- 認証済みユーザーは自分の注文
  );
```

---

## 悪いパターン（やってはいけない）

### ❌ "とりあえず USING (true)"
```sql
-- F-18 の原因。UUID 知識を強制しない=全件漏洩
CREATE POLICY "orders_public_select_by_uuid" ON public.orders
  FOR SELECT USING (true);
```

### ❌ `GRANT ALL ... TO anon`
```sql
-- INSERT / UPDATE / DELETE まで anon に許可される
GRANT ALL ON public.orders TO anon;
```

### ❌ Realtime の RLS 評価を忘れる
```sql
-- HTTP header を見るポリシーは REST では効くが Realtime では効かない
USING (access_token = current_setting('request.headers')::json->>'x-token')
-- Realtime は JWT claim ベース。client subscribe 時に拒否されない設計か確認すること
```

---

## 関連ドキュメント

- `AGENTS.md` — 「Supabase RLS の罠」セクション
- `docs/security-review-2026-05-21.md` — F-18 の経緯
- `docs/customer-jwt-design.md`（予定 / #31）— A+ 実装の設計
- `tests/security/anon-rest-access.test.ts` — 検証テスト
