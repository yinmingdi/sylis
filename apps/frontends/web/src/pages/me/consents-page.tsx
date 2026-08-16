import {
  ConsentDataCategory,
  ConsentDecision,
  ConsentPurpose,
} from '@sylis/api-client/user';
import { Button, DataList, PageHeader, ShieldCheck } from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  consentsQuery,
  identityCommands,
  useCurrentUserId,
} from '../../modules/identity';
import { RemoteState } from '../page-utils';
import { asArray, asRecord, stringValue } from '../page-values';

const purposeOptions = [
  {
    purpose: ConsentPurpose.OPTIONAL_MODEL_EXCHANGE,
    categories: [
      ConsentDataCategory.MODEL_INPUT,
      ConsentDataCategory.MODEL_OUTPUT,
    ],
  },
  {
    purpose: ConsentPurpose.MODEL_ASSET_PROCESSING,
    categories: [
      ConsentDataCategory.ASSET_CONTENT,
      ConsentDataCategory.MODEL_INPUT,
      ConsentDataCategory.MODEL_OUTPUT,
    ],
  },
  {
    purpose: ConsentPurpose.LEARNING_RESPONSE_RETENTION,
    categories: [ConsentDataCategory.LEARNING_RESPONSE],
  },
] as const;

export function ConsentsPage() {
  const userId = useCurrentUserId();
  const queryOptions = consentsQuery(userId);
  const query = useQuery(queryOptions);
  const cache = useQueryClient();
  const rows = asArray(query.data).map(asRecord);
  const record = useMutation({
    mutationFn: ({
      purpose,
      categories,
      decision,
    }: {
      purpose: ConsentPurpose;
      categories: readonly ConsentDataCategory[];
      decision: ConsentDecision;
    }) =>
      identityCommands.recordConsent({
        purpose,
        categories: [...categories],
        decision,
        policyVersion: '0.0.1',
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: queryOptions.queryKey }),
  });
  return (
    <div className="page">
      <PageHeader eyebrow="Privacy" title="隐私授权" />
      <RemoteState pending={query.isPending} error={query.error}>
        <DataList
          rows={purposeOptions.map(({ purpose, categories }) => {
            const current = rows.find((row) => row.purpose === purpose);
            const granted = current?.decision === ConsentDecision.GRANTED;
            return {
              label: purpose,
              value: granted ? '已授权' : '未授权',
              detail: current
                ? stringValue(current.recordedAt ?? current.createdAt)
                : '-',
              action: (
                <Button
                  icon={ShieldCheck}
                  tone={granted ? 'quiet' : 'secondary'}
                  onClick={() =>
                    record.mutate({
                      purpose,
                      categories,
                      decision: granted
                        ? ConsentDecision.WITHDRAWN
                        : ConsentDecision.GRANTED,
                    })
                  }
                >
                  {granted ? '撤回' : '授权'}
                </Button>
              ),
            };
          })}
        />
      </RemoteState>
    </div>
  );
}
