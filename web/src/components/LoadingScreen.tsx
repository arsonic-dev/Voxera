interface LoadingScreenProps {
  message?: string;
  onDismiss?: () => void;
}

export default function LoadingScreen({
  message = 'Loading…',
  onDismiss,
}: LoadingScreenProps) {
  return (
    <div
      className="loading-screen-overlay"
      role="status"
      aria-live="polite"
      onClick={onDismiss}
    >
      <div className="pl">
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__dot"></div>
        <div className="pl__text">{message}</div>
      </div>
    </div>
  );
}
