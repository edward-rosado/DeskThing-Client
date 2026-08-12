import { Icon } from '.'

function IconUsb(props): JSX.Element {
  return (
    <Icon {...props} fill="currentColor">
      <svg viewBox="0 0 24 24">
        <path d="M15,7V11H16V13H13V5H15L12,1L9,5H11V13H8V10.93C8.7,10.56 9.2,9.85 9.2,9C9.2,7.78 8.21,6.8 7,6.8C5.78,6.8 4.8,7.78 4.8,9C4.8,9.85 5.3,10.56 6,10.93V13C6,14.11 6.89,15 8,15H11V18.05C10.29,18.41 9.8,19.15 9.8,20C9.8,21.21 10.79,22.2 12,22.2C13.21,22.2 14.2,21.21 14.2,20C14.2,19.15 13.71,18.41 13,18.05V15H16C17.11,15 18,14.11 18,13V11H19V7H15Z" />
      </svg>
    </Icon>
  )
}

export default IconUsb
