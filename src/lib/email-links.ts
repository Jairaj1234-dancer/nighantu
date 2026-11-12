/**
 * One prefilled email, three ways to open it. A mailto: link needs a mail program set up on the
 * computer, which many Windows and shared computers do not have, so the same email is also offered as
 * a Gmail and an Outlook web compose link, which open in the browser on any system.
 */
export const emailLinks = (to: string, subject: string, body: string) => {
  const s = encodeURIComponent(subject), b = encodeURIComponent(body), t = encodeURIComponent(to);
  return {
    mailto: `mailto:${to}?subject=${s}&body=${b}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${t}&su=${s}&body=${b}`,
    outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${t}&subject=${s}&body=${b}`,
  };
};
