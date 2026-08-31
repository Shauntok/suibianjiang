import Script from "next/script";

type GoogleAnalyticsProps = {
  measurementId?: string;
};

const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

export default function GoogleAnalytics({
  measurementId,
}: GoogleAnalyticsProps) {
  if (!measurementId || !GA4_MEASUREMENT_ID_PATTERN.test(measurementId)) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
