function nextStep(step) {
    const slider = document.getElementById('form-slider');
    
    // Animate to new step
    const offset = -(step - 1) * 100;
    slider.style.transform = `translateX(${offset}%)`;
    
    // Update active class on steps
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    setTimeout(() => {
        document.getElementById(`step-${step}`).classList.add('active');
        // Auto focus first input if any
        const firstInput = document.getElementById(`step-${step}`).querySelector('input, select');
        if(firstInput) firstInput.focus();
    }, 300);

    // Update sidebar indicators
    updateIndicators(step);
}

function prevStep(step) {
    const slider = document.getElementById('form-slider');
    
    const offset = -(step - 1) * 100;
    slider.style.transform = `translateX(${offset}%)`;
    
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    setTimeout(() => {
        document.getElementById(`step-${step}`).classList.add('active');
    }, 300);

    updateIndicators(step);
}

function completeRegistration() {
    // Show success state
    const slider = document.getElementById('form-slider');
    const offset = -300; // Step 4
    slider.style.transform = `translateX(${offset}%)`;
    
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    setTimeout(() => {
        document.getElementById('step-4').classList.add('active');
    }, 300);

    // Complete all indicators
    document.querySelectorAll('.step-indicator').forEach(ind => {
        ind.classList.remove('active');
        ind.classList.add('completed');
    });
}

function updateIndicators(currentStep) {
    document.querySelectorAll('.step-indicator').forEach((ind, index) => {
        const stepNum = index + 1;
        
        ind.classList.remove('active', 'completed');
        
        if (stepNum < currentStep) {
            ind.classList.add('completed');
        } else if (stepNum === currentStep) {
            ind.classList.add('active');
        }
    });
}

// OTP Auto-advance logic
const otpInputs = document.querySelectorAll('.otp-input');
otpInputs.forEach((input, index) => {
    input.addEventListener('keyup', (e) => {
        if (e.key >= 0 && e.key <= 9) {
            if (index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        } else if (e.key === 'Backspace') {
            if (index > 0) {
                otpInputs[index - 1].focus();
            }
        }
    });
});
