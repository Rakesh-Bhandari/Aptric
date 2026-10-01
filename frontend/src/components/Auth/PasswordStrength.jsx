import { getPasswordStrength } from '../../utils/password';

const PasswordStrength = ({ password }) => {
    const strength = getPasswordStrength(password);
    if (!strength) return null;
    return (
        <div className="pw-strength-wrapper">
            <div className="pw-strength-bars">
                {[1, 2, 3, 4].map((lvl) => (
                    <div
                        key={lvl}
                        className={`pw-strength-bar ${strength.level >= lvl ? `active level-${strength.level}` : ''}`}
                    />
                ))}
            </div>
            <span className={`pw-strength-label level-${strength.level}`}>{strength.label}</span>
        </div>
    );
};

export default PasswordStrength;
