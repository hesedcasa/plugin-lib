# Changelog

## [0.10.0](https://github.com/hesedcasa/plugin-lib/compare/v0.9.0...v0.10.0) (2026-06-23)


### 🎉 Features

* add command-surface utilities and HostConfigCommand ([9fb3fab](https://github.com/hesedcasa/plugin-lib/commit/9fb3fabbd38decc230dff882ccb7574445eb6017))
* add command-surface utilities and HostConfigCommand ([b21e415](https://github.com/hesedcasa/plugin-lib/commit/b21e41595555b6a7bb199f64c3e92b7ca11a53f4))

## [0.9.0](https://github.com/hesedcasa/plugin-lib/compare/v0.8.0...v0.9.0) (2026-06-04)


### 🎉 Features

* **auth:** thread configFile option through all auth command factories ([a634756](https://github.com/hesedcasa/plugin-lib/commit/a634756e2a4e4ddd99e2c61c469c0d8cc9c02f17))

## [0.8.0](https://github.com/hesedcasa/plugin-lib/compare/v0.7.0...v0.8.0) (2026-06-03)


### 🎉 Features

* **config:** add optional configFile param to createProfileManager ([dc1f10a](https://github.com/hesedcasa/plugin-lib/commit/dc1f10a89d53016a623ba676dd8df9102e663dc8))

## [0.7.0](https://github.com/hesedcasa/plugin-lib/compare/v0.6.0...v0.7.0) (2026-06-01)


### 🎉 Features

* **config:** add secret storage resolution for env: and file: references ([bf9fef3](https://github.com/hesedcasa/plugin-lib/commit/bf9fef310a91e774df562d3a5554377b8ad5cadb))
* **config:** add secret storage resolution for env: and file: references ([7e43a75](https://github.com/hesedcasa/plugin-lib/commit/7e43a75a3327330b6a0faa7f31ccb3ba59efa56c))

## [0.6.0](https://github.com/hesedcasa/plugin-lib/compare/v0.5.0...v0.6.0) (2026-05-31)


### 🎉 Features

* **auth:** extract command files, add pgauth support, and add CLAUDE.md ([6695d87](https://github.com/hesedcasa/plugin-lib/commit/6695d8780a7c58289d92ca1582c37900422e7864))
* **auth:** extract command files, add pgauth support, and add CLAUDE.md ([3a3c5e1](https://github.com/hesedcasa/plugin-lib/commit/3a3c5e1f5c81474b6d9b3ebb0adeb9002e654f41))

## [0.5.0](https://github.com/hesedcasa/plugin-lib/compare/v0.4.0...v0.5.0) (2026-05-29)


### 🎉 Features

* **auth:** support number and boolean field types in dynamic auth commands ([1dfd84e](https://github.com/hesedcasa/plugin-lib/commit/1dfd84e8c2bab3654246ad53c9c14dfe30822674))


### 🛠️ Fixes

* **auth:** make masked fields actually use a password prompt ([7f4aea6](https://github.com/hesedcasa/plugin-lib/commit/7f4aea6f67836ef872dbcd6bd2061a072a5ad7f7))


### ♻️ Chores

* **auth:** remove duplication and fix config.ts/auth.ts inconsistencies ([4669054](https://github.com/hesedcasa/plugin-lib/commit/46690546fa5a83e25c82c567cfcb5e9ec2bbfd2d))
* **auth:** remove duplication and fix config.ts/auth.ts inconsistencies ([7026e90](https://github.com/hesedcasa/plugin-lib/commit/7026e90c3e4d1d2282201c3efdee47b5e982febb))

## [0.4.0](https://github.com/hesedcasa/plugin-lib/compare/v0.3.0...v0.4.0) (2026-05-27)


### 🎉 Features

* add createAuthDeleteCommand for removing auth profiles ([6fc085f](https://github.com/hesedcasa/plugin-lib/commit/6fc085f3b6daad8c2a7e020ed0e39474ee226f9e))
* add createAuthDeleteCommand for removing auth profiles ([eaeac9f](https://github.com/hesedcasa/plugin-lib/commit/eaeac9f25a5e92f69827452d4676ab1c43014e37))
* add generic type params and FieldDef for multi-profile support ([928e741](https://github.com/hesedcasa/plugin-lib/commit/928e7418cdfd0a6996b019fdd28060b91bc3e6de))
* add generic type params and FieldDef for multi-profile support ([8caf3ec](https://github.com/hesedcasa/plugin-lib/commit/8caf3ec2a3b6fc6d5015db241dc536cef931863a))

## [0.3.0](https://github.com/hesedcasa/plugin-lib/compare/v0.2.2...v0.3.0) (2026-05-26)


### 🎉 Features

* add ApiResult, buildAuthHeader, createApiClient to shared exports ([96d4b08](https://github.com/hesedcasa/plugin-lib/commit/96d4b083cc05b7045841a8a34dac4fc1297b931e))
* add ApiResult, buildAuthHeader, createApiClient to shared exports ([6113fb8](https://github.com/hesedcasa/plugin-lib/commit/6113fb8a379f91971222937693b7ab350295a281))

## [0.2.2](https://github.com/hesedcasa/plugin-lib/compare/v0.2.1...v0.2.2) (2026-05-24)


### ♻️ Chores

* derive config file path from oclif Config object ([2b1ba09](https://github.com/hesedcasa/plugin-lib/commit/2b1ba09835df0ba557b4f7ae2d3d966a202a94a7))
* derive config file path from oclif Config object ([7789444](https://github.com/hesedcasa/plugin-lib/commit/77894448d3329c2c6e79c7946d129192444dd28b))

## [0.2.1](https://github.com/hesedcasa/plugin-lib/compare/v0.2.0...v0.2.1) (2026-05-24)


### 🛠️ Fixes

* address Codex review issues in auth factory and package config ([6db4ab7](https://github.com/hesedcasa/plugin-lib/commit/6db4ab748c6442b1e3907ef92f145a12f0241845))
* align tests with new createProfileManager API and auth factory pattern ([e285d22](https://github.com/hesedcasa/plugin-lib/commit/e285d2259cd1ff0332f9584e2960aafe9dba50ec))


### ♻️ Chores

* replace placeholder auth commands with factory pattern ([59d188c](https://github.com/hesedcasa/plugin-lib/commit/59d188c71a2b53b4bb417870278821861d89547d))
* replace placeholder auth commands with factory pattern ([0bd5458](https://github.com/hesedcasa/plugin-lib/commit/0bd545882a69f60ef3ec36f9ebd8769b5157bbff))
* **test:** move auth test to test/auth.test.ts ([ea1d78c](https://github.com/hesedcasa/plugin-lib/commit/ea1d78c51e842e8e0f6bd3b2f26877e61021f65c))

## [0.2.0](https://github.com/hesedcasa/plugin-lib/compare/v0.1.1...v0.2.0) (2026-05-21)


### 🎉 Features

* add init hook to rename placeholder topic to bin name at runtime ([58c3b00](https://github.com/hesedcasa/plugin-lib/commit/58c3b0045c2dd110566b24ea306c3dbecc9469b6))
* add init hook to rename placeholder topic to bin name at runtime ([612333e](https://github.com/hesedcasa/plugin-lib/commit/612333e4f28ec6b987d054f466c08eaac9b0f21b))

## [0.1.1](https://github.com/hesedcasa/plugin-lib/compare/v0.1.0...v0.1.1) (2026-05-16)


### 🛠️ Fixes

* **test:** use platform-aware path construction to fix Windows CI failure ([6a293a7](https://github.com/hesedcasa/plugin-lib/commit/6a293a7636c4f889fa7b879c788b6b697255dd5e))

## Changelog


All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
