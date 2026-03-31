import styles from './Camera.module.css';

const CAMERA_SERVER = 'http://localhost:8080';

export function Camera() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Camera</h1>
        <a
          href={CAMERA_SERVER}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.externalLink}
        >
          Open Full UI ↗
        </a>
      </div>
      <div className={styles.iframeWrapper}>
        <iframe
          src={CAMERA_SERVER}
          className={styles.iframe}
          title="Camera Member"
          allow="camera; microphone"
        />
      </div>
    </div>
  );
}
