---
status: accepted
---

# Controlled GitFlow on Railway

`develop` deploys staging, `release/*` freezes and qualifies a version, and only a reviewed release or hotfix may enter protected `main`. Railway production waits for required CI, production smoke precedes the semantic tag, and application DeploymentRelease remains separate from LexiconRelease.
