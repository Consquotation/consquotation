import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { LicenseService } from "../../../application/licenseService";
import {
  LICENSE_OWNER_EMAIL,
  LicenseState,
  formatLocalDate,
  gmailComposeUrl,
  licenseRequest,
  mailtoUrl,
  outlookComposeUrl,
} from "../../../domain/license/license";
import { APP_VERSION } from "../../../shared/buildInfo";
import { LICENSE_UI as s } from "../../../shared/strings.license.vi";
import { useExclusive } from "../../useExclusive";

/* global document, HTMLTextAreaElement, navigator, Office, window */

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM },
  section: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
});

type Notice = { intent: "success" | "warning" | "error" | "info"; text: string } | null;

/**
 * Mở trang soạn thư. Đường dẫn https mở bằng trình duyệt mặc định qua Office (OpenBrowserWindowApi).
 * Excel desktop bỏ qua mailto: cả qua Office lẫn window.open, kể cả khi người dùng bấm thật (đã kiểm
 * chứng 2026-10-28), nên nút ứng dụng thư chỉ hiện trên Excel web.
 */
function openUrl(url: string): void {
  if (url.startsWith("https:")) {
    try {
      if (typeof Office !== "undefined" && Office.context?.ui?.openBrowserWindow) {
        Office.context.ui.openBrowserWindow(url);
        return;
      }
    } catch {
      // Rơi xuống cách dưới.
    }
  }
  window.open(url, "_blank");
}

/** Sao chép: Clipboard API bị chặn trong WebView của Excel (đã kiểm chứng) → dùng execCommand. */
async function copyText(text: string, textarea: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!textarea) return false;
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  }
}

/** Tab Cài đặt › Cấp phép; khi hết hạn dùng thử, đây là màn hình chính (ADR-0015). */
const LicensePanel: React.FC<{
  service: LicenseService;
  state: LicenseState;
  onChange: (state: LicenseState) => void;
  /** Có khi hết hạn dùng thử: vẫn cho tải bản sao lưu thư viện. */
  onBackup?: () => Promise<string>;
  /** Excel trên web: trình duyệt mở được mailto:. Excel desktop chặn mailto: (đã kiểm chứng). */
  allowMailApp?: boolean;
}> = ({ service, state, onChange, onBackup, allowMailApp = false }) => {
  const styles = useStyles();
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>(null);
  const exclusive = useExclusive();
  const textarea = React.useRef<HTMLTextAreaElement>(null);
  const trialStart = state.kind === "licensed" ? state.activatedAt : state.startedAt;
  const mail = licenseRequest({ appVersion: APP_VERSION, trialStart });
  const mailText = `Tới: ${mail.to}\nTiêu đề: ${mail.subject}\n\n${mail.body}`;

  const activate = () =>
    exclusive(async () => {
      setBusy(true);
      setNotice(null);
      try {
        const result = await service.activate(email, code);
        if (result.ok) {
          setNotice({ intent: "success", text: s.activated });
          onChange(result.state);
        } else {
          setNotice({ intent: "error", text: s.errors[result.reason] });
        }
      } finally {
        setBusy(false);
      }
    });

  const copy = async () => {
    const ok = await copyText(mailText, textarea.current);
    setNotice(
      ok ? { intent: "success", text: s.copied } : { intent: "warning", text: s.copyFailed }
    );
  };

  const compose = (url: string) => {
    openUrl(url);
    setNotice({ intent: "info", text: s.requestOpened });
  };

  const backup = () =>
    exclusive(async () => {
      if (!onBackup) return;
      try {
        setNotice({ intent: "success", text: await onBackup() });
      } catch (e) {
        setNotice({ intent: "error", text: e instanceof Error ? e.message : String(e) });
      }
    });

  return (
    <section className={styles.root} aria-labelledby="cq-license-title">
      <Subtitle2 as="h2" id="cq-license-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <MessageBar
        intent={state.kind === "licensed" ? "success" : state.kind === "trial" ? "info" : "warning"}
        layout="multiline"
      >
        <MessageBarBody>
          {state.kind === "licensed"
            ? s.licensed(state.email)
            : state.kind === "trial"
              ? s.trial(state.daysLeft, formatLocalDate(state.endsAt))
              : s.expired(formatLocalDate(state.endedAt))}
        </MessageBarBody>
      </MessageBar>
      {state.kind === "licensed" && <Caption1>{s.licensedCode(state.code)}</Caption1>}
      {notice && (
        <MessageBar intent={notice.intent} layout="multiline" politeness="polite">
          <MessageBarBody>{notice.text}</MessageBarBody>
        </MessageBar>
      )}

      {state.kind !== "licensed" && (
        <>
          <div className={styles.section}>
            <Subtitle2 as="h3">{s.requestTitle}</Subtitle2>
            <Body1>{s.requestIntro(LICENSE_OWNER_EMAIL)}</Body1>
            <div className={styles.actions}>
              <Button appearance="primary" onClick={() => compose(gmailComposeUrl(mail))}>
                {s.composeGmail}
              </Button>
              <Button onClick={() => compose(outlookComposeUrl(mail))}>{s.composeOutlook}</Button>
              {allowMailApp && (
                <Button onClick={() => compose(mailtoUrl(mail))}>{s.composeApp}</Button>
              )}
              <Button onClick={() => void copy()}>{s.copy}</Button>
            </div>
            <Field label={s.requestText}>
              <Textarea ref={textarea} value={mailText} readOnly resize="vertical" rows={6} />
            </Field>
          </div>

          <div className={styles.section}>
            <Subtitle2 as="h3">{s.activateTitle}</Subtitle2>
            <Body1>{s.activateIntro}</Body1>
            <Field label={s.email} required>
              <Input type="email" value={email} onChange={(_e, d) => setEmail(d.value)} />
            </Field>
            <Field label={s.code} required>
              <Input value={code} onChange={(_e, d) => setCode(d.value)} />
            </Field>
            <div className={styles.actions}>
              <Button appearance="primary" disabled={busy} onClick={() => void activate()}>
                {busy ? s.activating : s.activate}
              </Button>
            </div>
          </div>
        </>
      )}

      {onBackup && (
        <div className={styles.section}>
          <Subtitle2 as="h3">{s.backupTitle}</Subtitle2>
          <Body1>{s.backupIntro}</Body1>
          <div className={styles.actions}>
            <Button onClick={() => void backup()}>{s.backupButton}</Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default LicensePanel;
