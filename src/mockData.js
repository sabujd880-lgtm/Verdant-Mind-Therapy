export const INITIAL_PROFILE = {
  name: "Sabuj Das",
  title: "Psychologist",
  location: "Kolkata, India",
  experience: "1+ Years",
  languages: ["English", "Hindi", "Bengali"],
  bio: "Empathetic, evidence-based psychological support tailored to your unique journey. Specializing in cognitive-behavioral and dialectical therapies to help you navigate life's challenges.",
  specializations: [
    { id: "adhd", name: "ADHD", desc: "Navigating focus, executive dysfunction, and emotional regulation." },
    { id: "addiction", name: "Addiction Treatment", desc: "Supportive pathways for recovery and breaking behavioral dependencies." },
    { id: "anger", name: "Anger Management", desc: "Constructive outlets, trigger mapping, and emotional control." },
    { id: "anxiety", name: "Anxiety", desc: "Managing panic, social anxiety, and chronic worry through coping tools." },
    { id: "bipolar", name: "Bipolar Disorder", desc: "Stabilizing mood swings and structuring healthy daily routines." },
    { id: "teen-child", name: "Teen & Child Therapy", desc: "Empathetic guidance for developmental transitions and youth behavior." },
    { id: "depression", name: "Depression", desc: "Finding hope, energy, and reclaiming joy through evidence-based steps." },
    { id: "dbt", name: "Dialectical Behavior Therapy (DBT)", desc: "Core mindfulness, distress tolerance, and interpersonal effectiveness." },
    { id: "assessment", name: "Clinical Assessments", desc: "Structured clinical testing (GAD/PHQ), cognitive profiling, and diagnostic screening." }
  ]
};

export const INITIAL_AVAILABILITY = {
  workingDays: [1, 2, 3, 4, 5], // Monday (1) to Friday (5)
  startHour: "09:00",
  endHour: "17:00",
  blockedDates: ["17-07-2026", "24-07-2026"] // Example blocked holiday dates in DD-MM-YYYY
};

export const INITIAL_APPOINTMENTS = [
  {
    id: "apt-1",
    date: "10-07-2026",
    time: "11:00 AM",
    clientName: "Aarav Sharma",
    clientEmail: "aarav.sharma@example.com",
    clientPhone: "+91 98765 43210",
    clientAgeGroup: "Adult",
    sessionMode: "Video Session",
    status: "Confirmed",
    problemDescription: "Experiencing severe work-related stress and burnout over the past three months. Having trouble sleeping and finding it hard to focus during the day.",
    notes: "Client showed signs of moderate occupational burnout. Discussed boundary-setting techniques and introduced a basic mindfulness breathing exercise. Next session should follow up on the sleep log."
  },
  {
    id: "apt-2",
    date: "14-07-2026",
    time: "09:00 AM",
    clientName: "Priya Patel",
    clientEmail: "priya.p@example.com",
    clientPhone: "+91 87654 32109",
    clientAgeGroup: "Adult",
    sessionMode: "Audio Session",
    status: "Pending",
    problemDescription: "Ongoing anxiety related to social gatherings and public speaking. Seeking practical coping mechanisms to use before presentations.",
    notes: ""
  },
  {
    id: "apt-3",
    date: "15-07-2026",
    time: "02:00 PM",
    clientName: "Rohan Das",
    clientEmail: "rohan.das@example.com",
    clientPhone: "+91 76543 21098",
    clientAgeGroup: "Teen",
    sessionMode: "Chat Session",
    status: "Confirmed",
    problemDescription: "Parent reports difficulties with anger management at school and withdrawal from hobbies. Teen expresses feeling misunderstood.",
    notes: "Conducted initial rapport-building. Rohan responds well to game-based analogies. Dislikes parent's direct questioning. Focus next session on trigger identification."
  },
  {
    id: "apt-4",
    date: "16-07-2026",
    time: "04:00 PM",
    clientName: "Meera Sen",
    clientEmail: "meera.sen@example.com",
    clientPhone: "+91 65432 10987",
    clientAgeGroup: "Senior",
    sessionMode: "Video Session",
    status: "Cancelled",
    problemDescription: "Mild depressive symptoms following retirement. Feeling a lack of purpose and general isolation.",
    notes: "Session cancelled by client due to health issues. Rescheduling pending."
  }
];

export const INITIAL_MESSAGES = [
  {
    id: "msg-1",
    senderName: "Aarav Sharma",
    senderEmail: "aarav.sharma@example.com",
    subject: "Question about session requirements",
    message: "Hi Sabuj, for our upcoming session on July 10, is there any questionnaire or pre-session work I need to fill out beforehand? Thanks!",
    timestamp: "2026-07-09T10:15:00Z",
    status: "unread",
    replies: []
  },
  {
    id: "msg-2",
    senderName: "Kabir Mehta",
    senderEmail: "kabir.mehta@example.com",
    subject: "Inquiring about DBT group therapy sessions",
    message: "Hello Mr. Das, do you offer group therapy sessions for Dialectical Behavior Therapy (DBT) or is it strictly one-on-one? I'm highly interested in joining a group structure.",
    timestamp: "2026-07-12T14:30:00Z",
    status: "replied",
    replies: [
      {
        id: "rep-1",
        message: "Hi Kabir, currently I only conduct individual DBT sessions. However, I can refer you to excellent local groups if you'd like to complement our individual work.",
        timestamp: "2026-07-12T16:00:00Z"
      }
    ]
  },
  {
    id: "msg-3",
    senderName: "Priya Patel",
    senderEmail: "priya.p@example.com",
    subject: "Rescheduling question",
    message: "Hello, I booked a pending slot but was wondering if we could push it by 1 hour if possible? Let me know, thank you.",
    timestamp: "2026-07-13T09:00:00Z",
    status: "read",
    replies: []
  }
];

