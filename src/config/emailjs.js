// This is a mock function to simulate sending an email.
// In a real application, this would use the EmailJS SDK with proper credentials.
export const sendContactEmail = async (formData) => {
  console.log("Simulating email send with data:", formData);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Simulate a successful response
  if (formData.email && formData.name && formData.message) {
    return { success: true, message: "Your message has been sent successfully! We'll get back to you shortly." };
  } else {
    return { success: false, error: "Please fill in all required fields." };
  }
};
