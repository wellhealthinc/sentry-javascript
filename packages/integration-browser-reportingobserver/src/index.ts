import { ClientLike, Integration, ScopeContext } from '@sentry/types';
import { getGlobalObject, supportsReportingObserver } from '@sentry/utils';

type Report = {
  [key: string]: unknown;
  type: ReportTypes;
  url: string;
  body?: ReportBody;
};

enum ReportTypes {
  Crash = 'crash',
  Deprecation = 'deprecation',
  Intervention = 'intervention',
}

type ReportBody = CrashReportBody | DeprecationReportBody | InterventionReportBody;

type CrashReportBody = {
  [key: string]: unknown;
  crashId: string;
  reason?: string;
};

type DeprecationReportBody = {
  [key: string]: unknown;
  id: string;
  anticipatedRemoval?: Date;
  message: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
};

type InterventionReportBody = {
  [key: string]: unknown;
  id: string;
  message: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
};

type ReportingObserverOptions = {
  types?: ReportTypes[];
};

export class ReportingObserver implements Integration {
  public name = this.constructor.name;

  public constructor(
    private readonly _options: ReportingObserverOptions = {
      types: [ReportTypes.Crash, ReportTypes.Deprecation, ReportTypes.Intervention],
    },
  ) {}

  /**
   * @inheritDoc
   */
  public install(client: ClientLike): void {
    if (!supportsReportingObserver()) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const observer = new (getGlobalObject<any>().ReportingObserver)(
      (reports: Report[]) => {
        for (const report of reports) {
          const scope: ScopeContext = {
            extra: {
              url: report.url,
            },
          };
          const label = `ReportingObserver [${report.type}]`;
          let details = 'No details available';

          if (report.body) {
            // Object.keys doesn't work on ReportBody, as all properties are inheirted
            const plainBody: Record<string, unknown> = {};

            // eslint-disable-next-line guard-for-in
            for (const prop in report.body) {
              plainBody[prop] = report.body[prop];
            }

            scope.extra = {
              ...scope.extra,
              body: plainBody,
            };

            if (report.type === ReportTypes.Crash) {
              const body = report.body as CrashReportBody;
              // A fancy way to create a message out of crashId OR reason OR both OR fallback
              details = [body.crashId || '', body.reason || ''].join(' ').trim() || details;
            } else {
              const body = report.body as DeprecationReportBody | InterventionReportBody;
              details = body.message || details;
            }
          }

          client.captureMessage(`${label}: ${details}`, { scope });
        }
      },
      {
        buffered: true,
        types: this._options.types,
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    observer.observe();
  }
}
