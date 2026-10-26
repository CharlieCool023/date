/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { TemplateContent } from "./template-content.js";

const colors = {
  page: "#0b0c0c",
  card: "#121313",
  ink: "#eae9e4",
  muted: "#96968f",
  faint: "#6c6c66",
  line: "#262725",
  accent: "#c7a979",
  onAccent: "#141414"
};

const sans = "'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
const serif = "Georgia, 'Times New Roman', serif";
const mono = "Consolas, 'SFMono-Regular', Menlo, 'Courier New', monospace";

export interface EmailLayoutProps {
  content: TemplateContent;
  actionUrl: string;
  appUrl: string;
}

export function EmailLayout({ content, actionUrl, appUrl }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{content.preview}</Preview>
      <Body style={{ margin: 0, padding: "40px 12px", backgroundColor: colors.page, fontFamily: sans }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto" }}>
          <Text style={{ margin: "0 0 24px", padding: "0 8px", color: colors.ink, fontFamily: mono, fontSize: "13px", letterSpacing: "0.32em" }}>
            VELUM
          </Text>
          <Section style={{ backgroundColor: colors.card, border: `1px solid ${colors.line}`, borderRadius: "4px", padding: "44px 40px 40px" }}>
            <Text style={{ margin: "0 0 18px", color: colors.accent, fontFamily: mono, fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              {content.eyebrow}
            </Text>
            <Heading as="h1" style={{ margin: "0 0 22px", color: colors.ink, fontFamily: serif, fontSize: "32px", lineHeight: "1.15", fontWeight: 400 }}>
              {content.heading}
            </Heading>
            {content.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={{ margin: "0 0 16px", color: colors.muted, fontSize: "15px", lineHeight: "1.65" }}>
                {paragraph}
              </Text>
            ))}
            <Section style={{ margin: "30px 0 8px" }}>
              <Button
                href={actionUrl}
                style={{ display: "inline-block", backgroundColor: colors.accent, color: colors.onAccent, fontSize: "14px", fontWeight: 500, textDecoration: "none", padding: "14px 24px", borderRadius: "2px" }}
              >
                {content.action}&nbsp;&nbsp;&#8599;
              </Button>
            </Section>
            <Text style={{ margin: "20px 0 0", color: colors.faint, fontSize: "12px", lineHeight: "1.6", wordBreak: "break-all" }}>
              Or paste this link into your browser:<br />
              <Link href={actionUrl} style={{ color: colors.muted, textDecoration: "underline" }}>{actionUrl}</Link>
            </Text>
            {content.note ? (
              <>
                <Hr style={{ borderColor: colors.line, margin: "28px 0 20px" }} />
                <Text style={{ margin: 0, color: colors.faint, fontSize: "13px", lineHeight: "1.6" }}>{content.note}</Text>
              </>
            ) : null}
          </Section>
          <Text style={{ margin: "24px 0 4px", padding: "0 8px", color: colors.faint, fontSize: "12px", lineHeight: "1.6" }}>
            Private by design. Human by choice.
          </Text>
          <Text style={{ margin: 0, padding: "0 8px", color: colors.faint, fontSize: "12px", lineHeight: "1.6" }}>
            Velum will never ask for your passkey or recovery codes by email.{" "}
            <Link href={appUrl} style={{ color: colors.muted, textDecoration: "underline" }}>{new URL(appUrl).host}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
