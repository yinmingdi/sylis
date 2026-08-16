import {
  PrismaTypes,
  SourceDatasetVersionStatus,
  type SylisDatabase,
} from "@sylis/database";
import type { SourceRecordRegistryPort } from "@sylis/lexicon-compiler";
import { canonicalJson } from "@sylis/utils";
import { stableArtifactId } from "@sylis/utils/stable-uuid";

const SOURCE_RECORD_PAGE_SIZE = 500;

const sourceDatasetId = (sourceKey: string): string =>
  stableArtifactId("dataset", sourceKey);

const normalizedChecksum = (checksum: string): string =>
  `sha256:${checksum.replace(/^sha256:/, "").toLowerCase()}`;

function assertEqual(
  label: string,
  id: string,
  actual: unknown,
  expected: unknown,
): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`SOURCE_REGISTRY_IMMUTABLE_MISMATCH:${label}:${id}`);
  }
}

export function createSourceRecordRegistry(
  database: SylisDatabase,
): SourceRecordRegistryPort {
  return {
    async register(sources, records) {
      const sourceByKey = new Map(
        sources.map((source) => [source.key, source]),
      );
      for (const record of records) {
        const source = sourceByKey.get(record.datasetKey);
        if (
          !source ||
          record.datasetVersion !== source.version ||
          record.datasetVersionId !==
            stableArtifactId("datasetVersion", source.key, source.version) ||
          record.rightsPolicyId !==
            stableArtifactId("rightsPolicy", source.key, source.version)
        ) {
          throw new Error(
            `SOURCE_REGISTRY_RECORD_IDENTITY_MISMATCH:${record.sourceRecordId}`,
          );
        }
      }

      await database.sourceRightsPolicy.createMany({
        data: sources.map((source) => ({
          id: stableArtifactId("rightsPolicy", source.key, source.version),
          key: `rights:${source.key}`,
          version: source.version,
          mayBuild: source.rights.mayBuild,
          mayServe: source.rights.mayServe,
          mayExport: source.rights.mayExport,
          requiresAttribution: source.rights.requiresAttribution,
          attribution: source.rights.attribution ?? null,
          effectiveFrom: new Date(source.rights.effectiveFrom),
          effectiveTo: source.rights.effectiveTo
            ? new Date(source.rights.effectiveTo)
            : null,
        })),
        skipDuplicates: true,
      });
      await database.sourceDataset.createMany({
        data: sources.map((source) => ({
          id: sourceDatasetId(source.key),
          key: source.key,
          name: source.key,
          homepageUri: source.homepageUri ?? source.sourceUri,
        })),
        skipDuplicates: true,
      });
      const recordCountBySource = new Map<string, number>();
      for (const record of records) {
        recordCountBySource.set(
          record.datasetKey,
          (recordCountBySource.get(record.datasetKey) ?? 0) + 1,
        );
      }
      await database.sourceDatasetVersion.createMany({
        data: sources.map((source) => ({
          id: stableArtifactId("datasetVersion", source.key, source.version),
          datasetId: sourceDatasetId(source.key),
          version: source.version,
          sourceUri: source.sourceUri,
          checksum: normalizedChecksum(source.checksum),
          retrievedAt: new Date(source.retrievedAt),
          adapter: source.adapter,
          parserVersion: source.parserVersion,
          schemaVersion: "sylis.lexicon-candidate/1",
          validationSummary: {
            recordCount: recordCountBySource.get(source.key) ?? 0,
            errorCount: 0,
            warningCount: 0,
            validatorVersion: "lexicon-compiler-source/1",
          },
          status: SourceDatasetVersionStatus.VALIDATED,
          rightsPolicyId: stableArtifactId(
            "rightsPolicy",
            source.key,
            source.version,
          ),
        })),
        skipDuplicates: true,
      });

      const [storedPolicies, storedDatasets, storedVersions] =
        await Promise.all([
          database.sourceRightsPolicy.findMany({
            where: {
              id: {
                in: sources.map((source) =>
                  stableArtifactId("rightsPolicy", source.key, source.version),
                ),
              },
            },
          }),
          database.sourceDataset.findMany({
            where: {
              id: { in: sources.map((source) => sourceDatasetId(source.key)) },
            },
          }),
          database.sourceDatasetVersion.findMany({
            where: {
              id: {
                in: sources.map((source) =>
                  stableArtifactId(
                    "datasetVersion",
                    source.key,
                    source.version,
                  ),
                ),
              },
            },
          }),
        ]);
      const policyById = new Map(
        storedPolicies.map((value) => [value.id, value]),
      );
      const datasetById = new Map(
        storedDatasets.map((value) => [value.id, value]),
      );
      const versionById = new Map(
        storedVersions.map((value) => [value.id, value]),
      );
      for (const source of sources) {
        const policyId = stableArtifactId(
          "rightsPolicy",
          source.key,
          source.version,
        );
        const datasetId = sourceDatasetId(source.key);
        const versionId = stableArtifactId(
          "datasetVersion",
          source.key,
          source.version,
        );
        const policy = policyById.get(policyId);
        const dataset = datasetById.get(datasetId);
        const version = versionById.get(versionId);
        if (!policy || !dataset || !version) {
          throw new Error(`SOURCE_REGISTRY_WRITE_INCOMPLETE:${source.key}`);
        }
        assertEqual(
          "RIGHTS_POLICY",
          policyId,
          {
            key: policy.key,
            version: policy.version,
            mayBuild: policy.mayBuild,
            mayServe: policy.mayServe,
            mayExport: policy.mayExport,
            requiresAttribution: policy.requiresAttribution,
            attribution: policy.attribution,
            effectiveFrom: policy.effectiveFrom.toISOString(),
            effectiveTo: policy.effectiveTo?.toISOString() ?? null,
          },
          {
            key: `rights:${source.key}`,
            version: source.version,
            mayBuild: source.rights.mayBuild,
            mayServe: source.rights.mayServe,
            mayExport: source.rights.mayExport,
            requiresAttribution: source.rights.requiresAttribution,
            attribution: source.rights.attribution ?? null,
            effectiveFrom: new Date(source.rights.effectiveFrom).toISOString(),
            effectiveTo: source.rights.effectiveTo
              ? new Date(source.rights.effectiveTo).toISOString()
              : null,
          },
        );
        assertEqual(
          "DATASET",
          datasetId,
          {
            key: dataset.key,
            name: dataset.name,
            homepageUri: dataset.homepageUri,
          },
          {
            key: source.key,
            name: source.key,
            homepageUri: source.homepageUri ?? source.sourceUri,
          },
        );
        assertEqual(
          "DATASET_VERSION",
          versionId,
          {
            datasetId: version.datasetId,
            version: version.version,
            sourceUri: version.sourceUri,
            checksum: version.checksum,
            retrievedAt: version.retrievedAt.toISOString(),
            adapter: version.adapter,
            parserVersion: version.parserVersion,
            schemaVersion: version.schemaVersion,
            validationSummary: version.validationSummary,
            status: version.status,
            rightsPolicyId: version.rightsPolicyId,
          },
          {
            datasetId,
            version: source.version,
            sourceUri: source.sourceUri,
            checksum: normalizedChecksum(source.checksum),
            retrievedAt: new Date(source.retrievedAt).toISOString(),
            adapter: source.adapter,
            parserVersion: source.parserVersion,
            schemaVersion: "sylis.lexicon-candidate/1",
            validationSummary: {
              recordCount: recordCountBySource.get(source.key) ?? 0,
              errorCount: 0,
              warningCount: 0,
              validatorVersion: "lexicon-compiler-source/1",
            },
            status: SourceDatasetVersionStatus.VALIDATED,
            rightsPolicyId: policyId,
          },
        );
      }

      for (
        let offset = 0;
        offset < records.length;
        offset += SOURCE_RECORD_PAGE_SIZE
      ) {
        const page = records.slice(offset, offset + SOURCE_RECORD_PAGE_SIZE);
        await database.sourceRecord.createMany({
          data: page.map((record) => ({
            id: record.sourceRecordId,
            datasetVersionId: record.datasetVersionId,
            sourceKey: record.sourceKey,
            languageTag: record.languageTag,
            rawPayloadHash: record.rawPayloadHash,
            rawPayloadUri: record.sourceUri,
            rawPayload: record.rawPayload as PrismaTypes.InputJsonValue,
          })),
          skipDuplicates: true,
        });
        const storedRecords = await database.sourceRecord.findMany({
          where: { id: { in: page.map((record) => record.sourceRecordId) } },
        });
        const storedById = new Map(
          storedRecords.map((value) => [value.id, value]),
        );
        for (const record of page) {
          const stored = storedById.get(record.sourceRecordId);
          if (!stored) {
            throw new Error(
              `SOURCE_REGISTRY_WRITE_INCOMPLETE:${record.sourceRecordId}`,
            );
          }
          assertEqual(
            "SOURCE_RECORD",
            record.sourceRecordId,
            {
              datasetVersionId: stored.datasetVersionId,
              sourceKey: stored.sourceKey,
              languageTag: stored.languageTag,
              rawPayloadHash: stored.rawPayloadHash,
              rawPayloadUri: stored.rawPayloadUri,
              rawPayload: stored.rawPayload,
            },
            {
              datasetVersionId: record.datasetVersionId,
              sourceKey: record.sourceKey,
              languageTag: record.languageTag,
              rawPayloadHash: record.rawPayloadHash,
              rawPayloadUri: record.sourceUri,
              rawPayload: record.rawPayload,
            },
          );
        }
      }
    },
  };
}
