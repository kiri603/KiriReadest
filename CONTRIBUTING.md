# 参与 KiriReadest

KiriReadest 面向外语阅读与学习，由本项目独立维护，基于 [OpenReadest](https://github.com/luyishui/OpenReadest) 和 [Readest](https://github.com/readest/readest) 开发。

## 反馈问题与建议

请在 [KiriReadest Issues](https://github.com/kiri603/KiriReadest/issues) 搜索已有问题后再提交。报告问题时，请附上应用版本、操作系统、复现步骤、预期行为与实际行为。涉及书籍时，可提供不含个人信息、可合法分享的最小示例。

请勿公开 API Key、WebDAV 密码、访问令牌或包含这些内容的日志。

## 提交修改

- 较大的功能或方向调整，请先在本仓库发起 Issue 讨论。
- 每个 PR 聚焦一个问题，说明用户可见的变化与验证结果。
- 遵循现有代码风格，保留版权声明与第三方许可证。
- 本项目按 AGPL-3.0 发布，贡献的修改需兼容该许可证。
- 适合上游的独立修复，也欢迎向 OpenReadest 或 Readest 贡献，并遵循目标仓库的贡献指南。

开发环境与常用命令见 [README](README.md#开发与贡献)。

## 本机打包

以下流程在 Windows 上从当前工作树生成 Windows x64 NSIS 安装包和 Android ARM64 签名 APK。版本取自 `apps/openreadest-app/package.json`。打包前确认分支和本地改动，尤其是还未提交但需要进入安装包的修复。发布任务见 [CI 构建配置](.github/workflows/build.yml)。

### 环境与缓存

- 使用 Node.js 22 和 `corepack pnpm@10.11.0`。使用 `pnpm` 的子进程也要在 `PATH` 上找到 pnpm 10，避免新版 pnpm 尝试重装现有 `node_modules`。
- Windows 使用 Rust 的 `x86_64-pc-windows-msvc` 目标和 Visual Studio C++ Build Tools。Android 本机验证过 JDK 21、SDK Platform 36、Build Tools 36.0.0 和 NDK `27.2.12479018`。设置 `JAVA_HOME`、`ANDROID_HOME` 和 `NDK_HOME`，并安装 `aarch64-linux-android` Rust 目标。
- 新检出时从仓库根目录运行 `git submodule update --init --recursive`、`corepack pnpm@10.11.0 install --frozen-lockfile` 和 `corepack pnpm@10.11.0 --filter @openreadest/app setup-vendors`。锁文件或子模块变化、或本地资源缺失时补跑对应步骤。图标源有改动或图标文件缺失时，在应用目录运行 `corepack pnpm@10.11.0 run generate-icons`。
- 后续构建保留 pnpm store、`node_modules`、应用的 `.next`、Cargo 缓存、`target` 和 Gradle 缓存。按平台沿用上一次成功构建的 `CARGO_HOME`、`RUSTUP_HOME` 和 `CARGO_TARGET_DIR`。从 Cargo 的 `target/<目标>/release/deps/*.d` 可查到依赖用过的缓存路径。两端共用 `CARGO_TARGET_DIR` 时，先完成 Windows 原生构建，再启动 Android 原生构建。单个平台打包失败时，从失败步骤继续。

### 两端共用前端产物

从仓库根目录运行下面的 PowerShell 命令。后续构建在 `apps/openreadest-app` 目录运行。先按改动范围完成相关测试。

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$env:CARGO_TARGET_DIR = Join-Path $repo 'target'
$env:NODE_OPTIONS = '--max-old-space-size=8192'
$override = Join-Path $repo 'tmp/tauri-prebuilt.json'
New-Item -ItemType Directory -Path (Split-Path -Parent $override) -Force | Out-Null
'{"build":{"beforeBuildCommand":""}}' | Set-Content -LiteralPath $override -Encoding Ascii

Set-Location -LiteralPath (Join-Path $repo 'apps/openreadest-app')
corepack pnpm@10.11.0 run build
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath 'out/index.html')) {
    throw 'Frontend export failed'
}
```

应用的 `build` 命令使用 `.env.tauri` 导出 `out`。两个 Tauri 构建通过 `$override` 跳过各自的 `beforeBuildCommand`，因此只需导出一次。前端源码、工作区依赖、公开资源或构建环境变量有变动时重新导出。重试同一份源码时，可以使用这次成功导出的 `out`。

### Windows x64

建议在本机的 Windows 打包会话先应用下面这组已验证的工具设置。上次打包出现 `LNK1104` 且打不开的是 `lnk{…}.tmp`时，对应失败命令是 `lib.exe` 更新 `ring`、`zstd-sys` 的静态库，以及 `link.exe` 链接缩略图扩展依赖时。换临时目录后仍然失败。已验证的构建方式是使用 NDK 随附的 `llvm-lib.exe` 和当前 Rust 工具链的 `rust-lld.exe`。设置这些变量后再运行本节的构建命令。复用该平台已成功的链接设置，切换链接器会触发重新编译。

```powershell
$winTemp = Join-Path $repo 'tmp/windows-build'
New-Item -ItemType Directory -Path $winTemp -Force | Out-Null
$env:TMP = $env:TEMP = $winTemp
$rustSysroot = rustc --print sysroot
if ($LASTEXITCODE -ne 0) { throw 'Rust sysroot lookup failed' }
$env:AR_x86_64_pc_windows_msvc = Join-Path $env:NDK_HOME 'toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-lib.exe'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = Join-Path $rustSysroot 'lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe'
foreach ($tool in @($env:AR_x86_64_pc_windows_msvc, $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER)) {
    if (!(Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Missing build tool: $tool" }
}
```

NSIS 会把 `extensions/windows-thumbnail/target/windows_thumbnail.dll` 打进安装包。如果 DLL 缺失，或缩略图扩展的源码、依赖有改动，从应用目录运行以下命令。扩展是单独的 Cargo 工作区。

```powershell
Push-Location 'extensions/windows-thumbnail'
try {
    cargo build --locked --release --target x86_64-pc-windows-msvc --target-dir target
    if ($LASTEXITCODE -ne 0) { throw 'Thumbnail provider build failed' }
    Copy-Item -LiteralPath 'target/x86_64-pc-windows-msvc/release/windows_thumbnail.dll' `
        -Destination 'target/windows_thumbnail.dll' -Force
} finally {
    Pop-Location
}
```

```powershell
corepack pnpm@10.11.0 tauri build --target x86_64-pc-windows-msvc --bundles nsis --config $override --ci
if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed' }
```

如果本轮已生成 `openreadest.exe`，只有 NSIS 封装失败，修复原因后用 `corepack pnpm@10.11.0 tauri bundle --target x86_64-pc-windows-msvc --bundles nsis --config $override --ci` 单独重跑封装。

安装包位于 `$env:CARGO_TARGET_DIR/x86_64-pc-windows-msvc/release/bundle/nsis/`。覆盖安装前先退出应用，运行安装包并沿用原安装目录和安装范围。出现管理员授权提示时，由用户在 Windows 中确认。安装完成后检查应用能启动，并校验已安装的 `openreadest.exe` 与 NSIS 中的程序一致。Tauri 打包时会把二进制的 `__TAURI_BUNDLE_TYPE_VAR_UNK` 改成 `__TAURI_BUNDLE_TYPE_VAR_NSS`，打包结束后可能恢复构建目录中的 EXE。校验时可从安装包提取 EXE 比对 SHA-256。对于本地未签名包，也可在内存中替换构建 EXE 的这一处标记后比对 SHA-256。同版本重打包时，版本号仅用于核对版本配置。

### Android ARM64

已有 `src-tauri/gen/android/gradlew.bat` 的工作树直接复用生成项目。新检出缺少生成项目时，从应用目录运行 `corepack pnpm@10.11.0 tauri android init --ci`，并检查仓库定制过的 `app/build.gradle.kts`、`AndroidManifest.xml` 和资源文件是否保留。初始化后或 Android 图标有改动时运行 `corepack pnpm@10.11.0 run sync-android-icons`。

Gradle 从仓库根目录的 `.security_keys/android-keystore.properties` 读取 `storeFile`、`storePassword`、`keyAlias`、`keyPassword`。使用与原安装包相同的签名密钥才能覆盖升级。签名配置和密钥保存在本地。打包前确认 Android 版本和签名配置，避免编译完成后才发现配置缺失。

本机已验证的 Android 构建使用仓库下已有的 `.cargo-home`，以及 NDK Clang 的 `-save-temps=obj`。使用专门的 Android 构建会话，从上一节同一个仓库和应用目录读取已导出的前端，设置 `$repo`、`$override`、`CARGO_TARGET_DIR` 及工具链路径后运行。出现 `ring` 汇编的 `clang: error: unable to make temporary file: Permission denied` 时，`-save-temps=obj` 会把中间文件放在对象文件旁。出现 `tauri-plugin-fs` 在 `android/.tauri/tauri-api` 上的 `os error 183` 或 `os error 5` 时，先核对实际生效的 `CARGO_HOME`。本次从另一个仓库的 Cargo 缓存切回该仓库上次成功的缓存后通过了插件构建。

```powershell
$env:CARGO_HOME = "$repo/.cargo-home"
$env:CFLAGS_aarch64_linux_android = '-save-temps=obj'
$androidTemp = Join-Path $repo 'tmp/android-build'
New-Item -ItemType Directory -Path $androidTemp -Force | Out-Null
$env:TMP = $env:TEMP = $androidTemp
$androidLog = Join-Path $repo 'tmp/android-arm64-build.log'
corepack pnpm@10.11.0 tauri android build --target aarch64 --apk --split-per-abi --config $override --ci *> $androidLog
$androidExit = $LASTEXITCODE
if ($androidExit -ne 0) {
    $buildLog = Get-Content -LiteralPath $androidLog -Raw
    if ($buildLog -notmatch '(?m)^\s*Finished `release` profile' -or
        $buildLog -notmatch 'Creation symbolic link is not allowed for this system') {
        throw "Android native build failed. See $androidLog"
    }
}
```

当 `$androidExit` 为零时，APK 已生成，可直接校验。若上面的检查确认 Rust `release` 已完成且只有符号链接阶段失败，运行下面的命令完成打包和签名。使用旧 `.so` 会把旧前端一起打进包。

```powershell
$androidProject = 'src-tauri/gen/android'
$nativeLib = Join-Path $env:CARGO_TARGET_DIR 'aarch64-linux-android/release/libreadestlib.so'
$jniDir = Join-Path $androidProject 'app/src/main/jniLibs/arm64-v8a'
if ((Get-Item -LiteralPath $nativeLib).LastWriteTimeUtc -lt (Get-Item -LiteralPath 'out/index.html').LastWriteTimeUtc) {
    throw 'Android native library predates the frontend export'
}
New-Item -ItemType Directory -Path $jniDir -Force | Out-Null
$jniLib = Join-Path $jniDir 'libreadestlib.so'
Copy-Item -LiteralPath $nativeLib -Destination $jniLib -Force
if ((Get-FileHash -LiteralPath $nativeLib).Hash -ne (Get-FileHash -LiteralPath $jniLib).Hash) {
    throw 'JNI library copy checksum mismatch'
}

Push-Location $androidProject
try {
    ./gradlew.bat :app:assembleArm64Release -x :app:rustBuildArm64Release
    if ($LASTEXITCODE -ne 0) { throw 'Android APK packaging failed' }
} finally {
    Pop-Location
}
```

Gradle 缓存齐全时可加 `--offline`。成品通常是 `src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk`。用 SDK Build Tools 中的 `aapt dump badging` 核对包名 `com.openreadest.app`、`versionName`、`versionCode` 和 `arm64-v8a`。用 `apksigner verify --print-certs` 校验签名，并在需要覆盖升级时比对旧 APK 的证书 SHA-256。

交付前检查两个产物来自本次构建，并用 `Get-FileHash -Algorithm SHA256` 记录校验值。同版本重打包时使用单独的输出目录，方便查找和回退。

### GitHub Release

在 [KiriReadest 发布仓库](https://github.com/kiri603/KiriReadest/releases) 使用新标签创建草稿。标签要能定位到与新安装包对应的可公开源码。先核对变更，排除本机签名配置、密钥和构建缓存。沿用 macOS DMG 时，保留原文件名，按上次 Release 的 SHA-256 核对字节，并在发布说明中标明 macOS 实际版本和对应的源码链接。将平台安装包和 `SHA256SUMS.txt` 上传到草稿，核对 GitHub 返回的资产大小和 SHA-256 后发布。
