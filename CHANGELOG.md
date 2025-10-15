# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2025-10-15

### Added
- CHANGELOG.md to track version history

### Fixed
- Token expiration date parsing (removed erroneous *1000 multiplication)
- Command injection vulnerability in openBrowser function

### Changed
- Version bump from 2.1.3 to 2.2.0

## [2.1.3] - 2024

### Fixed
- Container restart loop by implementing reliable process-based health check
- Disabled unreliable health checks that caused restart issues

### Added
- Restart loop monitoring and debugging tools

## Earlier Versions

See git commit history for details on versions prior to 2.1.3.
