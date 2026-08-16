# Content Assets

本上下文管理 User 文件的稳定身份、不可变 revision、quarantine/clean 生命周期、派生内容和删除；不拥有 Agent Run、Reading/Lexicon 正式事实或模型路由。

## Language

**ContentAsset**:
一个 User 拥有、可产生多个不可变 revision 的文件身份。
_Avoid_: upload blob, object URL

**ContentAssetRevision**:
固定 checksum、detected type、size、object version、scanner/parser version 和状态的不可变文件版本。
_Avoid_: current file path, mutable attachment

**UploadIntent**:
绑定 owner、purpose、expected size/type/hash 和短 expiry 的 quarantine 上传许可。
_Avoid_: public upload URL

**Quarantine**:
任何未完成 malware/type/structure validation 的字节所在的隔离状态和 Bucket。
_Avoid_: temporary clean storage

**AssetDerivative**:
从精确 revision 和固定 tool/model/chunk policy 生成的 OCR、text、thumbnail、lexical index 或 embedding projection。
_Avoid_: latest derived data

**ContentDeletionRequest**:
立即隐藏目标并在 30 天内以 revision/object CAS 完成 hard purge 的可审计请求。
_Avoid_: best-effort delete
