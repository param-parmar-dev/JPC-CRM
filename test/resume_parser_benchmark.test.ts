import { parseResumeLocally, LocalParsedResume } from '../src/services/localResumeParser';

interface GroundTruth {
  id: number;
  description: string;
  expectedName: string;
  expectedEmail: string;
  expectedPhone: string;
  expectedCompany: string;
  expectedDesignation: string;
  expectedGradYear: string;
  expectedDegreeSubstring: string;
  expectedSkills: string[];
  resumeText: string;
}

const BENCHMARK_RESUMES: GroundTruth[] = [
  {
    id: 1,
    description: 'Senior Full Stack Engineer (US format, Stripe)',
    expectedName: 'Alex Morgan',
    expectedEmail: 'alex.morgan@email.com',
    expectedPhone: '(415) 555-0192',
    expectedCompany: 'Stripe',
    expectedDesignation: 'Senior Full Stack Engineer',
    expectedGradYear: '2016',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['React', 'TypeScript', 'Node.js', 'AWS', 'PostgreSQL'],
    resumeText: `
Alex Morgan
Senior Full Stack Engineer
alex.morgan@email.com | (415) 555-0192 | San Francisco, CA
https://linkedin.com/in/alexmorgan

PROFESSIONAL SUMMARY
Senior Engineer with 8 years of experience building high-scale financial platforms.

WORK EXPERIENCE
Senior Full Stack Engineer
Stripe | San Francisco, CA
March 2021 - Present
• Spearheaded migration of payment gateway to microservices
• Improved system availability to 99.999% across global regions

Software Engineer
Airbnb
June 2016 - February 2021
• Developed responsive guest booking interface using React and TypeScript
• Reduced search latency by 35% with Redis caching

EDUCATION
Bachelor of Science in Computer Science
University of California, Berkeley
2012 - 2016

SKILLS
JavaScript, TypeScript, React, Node.js, Python, AWS, Docker, PostgreSQL, Redis, GraphQL
    `
  },
  {
    id: 2,
    description: 'Indian DevOps Engineer (+91 phone, IIT, Indian IT)',
    expectedName: 'Rahul Sharma',
    expectedEmail: 'rahul.sharma@gmail.com',
    expectedPhone: '+91 98765 43210',
    expectedCompany: 'Infosys Limited',
    expectedDesignation: 'Lead DevOps Engineer',
    expectedGradYear: '2018',
    expectedDegreeSubstring: 'B.Tech',
    expectedSkills: ['Docker', 'Kubernetes', 'AWS', 'Terraform', 'Linux'],
    resumeText: `
Rahul Sharma
Lead DevOps Engineer
rahul.sharma@gmail.com | +91 98765 43210 | Bengaluru, India
linkedin.com/in/rahulsharmadevops

SUMMARY
Certified AWS & Kubernetes DevOps Professional with 6+ years managing multi-cloud infra.

WORK EXPERIENCE
Lead DevOps Engineer
Infosys Limited | Bengaluru, India
July 2021 - Present
• Designed automated CI/CD pipelines using GitHub Actions and ArgoCD
• Managed 200+ Kubernetes clusters on AWS EKS

Cloud Operations Specialist
Tata Consultancy Services
August 2018 - June 2021
• Automated cloud resource provisioning using Terraform and Ansible
• Reduced infrastructure costs by 22%

EDUCATION
B.Tech in Computer Science and Engineering
Indian Institute of Technology, Madras
2014 - 2018

TECHNICAL SKILLS
Cloud/DevOps: AWS, Docker, Kubernetes, Terraform, Ansible, Jenkins, Linux, Bash
Monitoring: Prometheus, Grafana
    `
  },
  {
    id: 3,
    description: 'Data Scientist & AI Researcher (Ph.D., PyTorch)',
    expectedName: 'Elena Rostova',
    expectedEmail: 'elena.rostova@stanford.edu',
    expectedPhone: '(650) 843-2211',
    expectedCompany: 'DeepMind',
    expectedDesignation: 'Staff Research Scientist',
    expectedGradYear: '2020',
    expectedDegreeSubstring: 'Ph.D',
    expectedSkills: ['Python', 'PyTorch', 'TensorFlow', 'Machine learning'],
    resumeText: `
Dr. Elena Rostova
Staff Research Scientist
elena.rostova@stanford.edu | (650) 843-2211 | Palo Alto, CA
https://github.com/erostova

PROFILE
Machine Learning researcher with 12 published papers in NeurIPS and ICML.

EXPERIENCE
Staff Research Scientist
DeepMind | Mountain View, CA
January 2021 - Present
• Led multimodal foundation model alignment and RLHF research
• Developed novel reasoning architectures reducing inference compute

Research Fellow
Stanford AI Lab
September 2016 - December 2020
• Conducted self-supervised visual representation research using PyTorch

ACADEMIC BACKGROUND
Ph.D in Artificial Intelligence
Stanford University
2016 - 2020

B.S. in Mathematics and Computer Science
MIT
2012 - 2016

SKILLS
Python, PyTorch, TensorFlow, C++, Machine Learning, Deep Learning, NLP, Spark
    `
  },
  {
    id: 4,
    description: 'Product Manager (MBA, Wharton)',
    expectedName: 'Marcus Vance',
    expectedEmail: 'marcus.vance@wharton.upenn.edu',
    expectedPhone: '(212) 449-8820',
    expectedCompany: 'Uber Technologies',
    expectedDesignation: 'Principal Product Manager',
    expectedGradYear: '2019',
    expectedDegreeSubstring: 'MBA',
    expectedSkills: ['Agile', 'Scrum', 'Jira', 'SQL'],
    resumeText: `
Marcus Vance
Principal Product Manager
marcus.vance@wharton.upenn.edu | (212) 449-8820 | New York, NY
linkedin.com/in/marcusvance

EXECUTIVE PROFILE
Data-driven Product Leader with 10 years scaling B2C mobile applications.

PROFESSIONAL EXPERIENCE
Principal Product Manager
Uber Technologies | New York, NY
June 2021 - Present
• Head of Rider Core Experience; increased ride booking completion by 14%
• Defined product roadmap and coordinated 4 engineering teams

Senior Product Manager
Lyft
August 2019 - May 2021
• Launched airport pickup dispatch algorithms generating $45M ARR

EDUCATION
MBA in General Management & Strategy
The Wharton School, University of Pennsylvania
2017 - 2019

B.A. in Economics
Columbia University
2011 - 2015

SKILLS
Product Strategy, Agile, Scrum, Jira, SQL, Tableau, A/B Testing, User Research
    `
  },
  {
    id: 5,
    description: 'Cloud Solutions Architect (AWS Certified, 15+ Yrs)',
    expectedName: 'David K. Miller',
    expectedEmail: 'david.miller@cloudarch.io',
    expectedPhone: '(206) 774-9011',
    expectedCompany: 'Amazon Web Services',
    expectedDesignation: 'Principal Cloud Architect',
    expectedGradYear: '2008',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['AWS', 'Kubernetes', 'Terraform', 'Go', 'Microservices'],
    resumeText: `
David K. Miller
Principal Cloud Architect
david.miller@cloudarch.io | (206) 774-9011 | Seattle, WA
https://linkedin.com/in/davidkmiller

SUMMARY
Enterprise Architect with 16 years designing resilient distributed systems.

WORK HISTORY
Principal Cloud Architect
Amazon Web Services | Seattle, WA
January 2018 - Present
• Guided 30+ Fortune 100 migrations to AWS serverless and container architectures
• Authored reference patterns for multi-region active-active disaster recovery

Lead Systems Engineer
Microsoft Corporation
July 2008 - December 2017
• Designed hyper-scale virtualization fabrics for early Azure compute nodes

EDUCATION
Bachelor of Science in Electrical and Computer Engineering
University of Washington
2004 - 2008

CERTIFICATIONS
AWS Certified Solutions Architect - Professional
CKA - Certified Kubernetes Administrator

CORE COMPETENCIES
AWS, Kubernetes, Docker, Terraform, Golang, Python, Microservices, Linux
    `
  },
  {
    id: 6,
    description: 'Recent College Graduate / Entry Level Software Engineer',
    expectedName: 'Samantha Lee',
    expectedEmail: 'samantha.lee2024@gmail.com',
    expectedPhone: '(312) 650-4491',
    expectedCompany: 'Salesforce',
    expectedDesignation: 'Software Engineering Intern',
    expectedGradYear: '2024',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['Java', 'Python', 'React', 'Git', 'SQL'],
    resumeText: `
Samantha Lee
samantha.lee2024@gmail.com | (312) 650-4491 | Chicago, IL
github.com/samlee24 | linkedin.com/in/samanthalee-dev

OBJECTIVE
Motivated 2024 CS graduate seeking full-time Software Engineer position.

EDUCATION
Bachelor of Science in Computer Science
University of Illinois Urbana-Champaign
Graduated May 2024

WORK EXPERIENCE
Software Engineering Intern
Salesforce | Chicago, IL
May 2023 - August 2023
• Built customer dashboard analytics widget in React and TypeScript
• Wrote unit tests in Jest achieving 92% code coverage

Undergraduate Teaching Assistant
UIUC Department of Computer Science
January 2023 - May 2024
• Mentored 80+ students in Data Structures and Algorithms in C++ and Java

TECHNICAL SKILLS
Languages: Python, Java, C++, TypeScript, JavaScript, SQL, HTML, CSS
Frameworks: React, Node.js, Express, Jest, Git
    `
  },
  {
    id: 7,
    description: 'UK Software Developer (+44 phone, BBC, London)',
    expectedName: 'Oliver Wright',
    expectedEmail: 'oliver.wright@developer.co.uk',
    expectedPhone: '+44 7911 123456',
    expectedCompany: 'British Broadcasting Corporation',
    expectedDesignation: 'Senior Backend Engineer',
    expectedGradYear: '2015',
    expectedDegreeSubstring: 'B.Sc',
    expectedSkills: ['Node.js', 'TypeScript', 'AWS', 'Docker', 'PostgreSQL'],
    resumeText: `
Oliver Wright
Senior Backend Engineer
oliver.wright@developer.co.uk | +44 7911 123456 | London, UK
https://linkedin.com/in/oliverwright-uk

PROFILE
Backend engineer with 9 years developing media streaming microservices.

EXPERIENCE
Senior Backend Engineer
British Broadcasting Corporation | London, UK
September 2019 - Present
• Designed iPlayer streaming metadata API handling 120,000 requests/sec
• Migrated on-prem services to AWS ECS and Lambda

Software Developer
Sky UK
October 2015 - August 2019
• Created content delivery pipelines in Node.js and TypeScript

QUALIFICATIONS
B.Sc in Computing and Information Systems
University of Manchester
2012 - 2015

SKILLS
Node.js, TypeScript, Express, PostgreSQL, Redis, AWS, Docker, Git, TDD
    `
  },
  {
    id: 8,
    description: 'QA Automation Engineer (ISTQB, Selenium)',
    expectedName: 'Pooja Nair',
    expectedEmail: 'pooja.nair@qa-lead.com',
    expectedPhone: '+91 94471 23456',
    expectedCompany: 'Capgemini',
    expectedDesignation: 'Lead QA Automation Engineer',
    expectedGradYear: '2017',
    expectedDegreeSubstring: 'B.Tech',
    expectedSkills: ['Selenium', 'Cypress', 'Java', 'Python', 'Jenkins'],
    resumeText: `
Pooja Nair
Lead QA Automation Engineer
pooja.nair@qa-lead.com | +91 94471 23456 | Pune, India
linkedin.com/in/poojanair-qa

SUMMARY
ISTQB Certified Test Automation Architect with 7 years specializing in end-to-end testing.

WORK EXPERIENCE
Lead QA Automation Engineer
Capgemini | Pune, India
January 2021 - Present
• Architected Cypress and Playwright web test frameworks
• Integrated regression test suites into Jenkins CI/CD pipelines

Senior Test Automation Engineer
Wipro Technologies
July 2017 - December 2020
• Developed hybrid Selenium WebDriver framework in Java

EDUCATION
B.Tech in Information Technology
College of Engineering, Pune
2013 - 2017

CERTIFICATIONS
ISTQB Advanced Level Test Automation Engineer
Certified Scrum Master

SKILLS
Selenium, Cypress, Playwright, Java, Python, Jenkins, Postman, Git, Jira, Agile
    `
  },
  {
    id: 9,
    description: 'Sales Account Executive (SaaS, Enterprise)',
    expectedName: 'Jordan Taylor',
    expectedEmail: 'jordan.taylor@salesrep.com',
    expectedPhone: '(512) 909-3381',
    expectedCompany: 'HubSpot',
    expectedDesignation: 'Senior Enterprise Account Executive',
    expectedGradYear: '2016',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['Salesforce', 'Jira', 'Agile'],
    resumeText: `
Jordan Taylor
Senior Enterprise Account Executive
jordan.taylor@salesrep.com | (512) 909-3381 | Austin, TX
linkedin.com/in/jordantaylor-sales

CAREER SUMMARY
Top-performing SaaS enterprise sales executive with 8 years of quota overachievement.

PROFESSIONAL EXPERIENCE
Senior Enterprise Account Executive
HubSpot | Austin, TX
February 2021 - Present
• Achieved 142% of annual quota generating $2.4M in new enterprise software revenue
• Managed full sales cycle from discovery to contract execution

Account Executive
Oracle Corporation
June 2016 - January 2021
• Sold cloud database products to mid-market accounts across Midwest

EDUCATION
Bachelor of Business Administration in Marketing
University of Texas at Austin
2012 - 2016

COMPETENCIES
Salesforce, HubSpot, Enterprise Prospecting, Pipeline Management, Contract Negotiation
    `
  },
  {
    id: 10,
    description: 'UI/UX Designer & Frontend Developer (Figma, React)',
    expectedName: 'Chloe Bennett',
    expectedEmail: 'chloe@designsystem.io',
    expectedPhone: '(303) 710-9284',
    expectedCompany: 'Figma',
    expectedDesignation: 'Senior Product Designer',
    expectedGradYear: '2018',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['React', 'TypeScript', 'HTML', 'CSS', 'Tailwind'],
    resumeText: `
Chloe Bennett
Senior Product Designer
chloe@designsystem.io | (303) 710-9284 | Denver, CO
https://github.com/chloebennett

PROFILE
Hybrid designer & developer creating accessible design systems and sleek web interfaces.

WORK EXPERIENCE
Senior Product Designer
Figma | Denver, CO
April 2022 - Present
• Designed community UI components used by 3M+ active designers
• Built React and Tailwind interactive prototype components

UI/UX Designer
Canva
August 2018 - March 2022
• Led design system overhaul improving team design velocity by 40%

EDUCATION
Bachelor of Fine Arts in Digital Design
Rhode Island School of Design
2014 - 2018

TECHNICAL SKILLS
Design: Figma, Adobe XD, Wireframing, User Testing, Prototyping
Frontend: HTML, CSS, Tailwind, JavaScript, TypeScript, React, Next.js, Git
    `
  },
  {
    id: 11,
    description: 'Multi-Role Engineer with Internal Promotions (Microsoft)',
    expectedName: 'Ethan Carter',
    expectedEmail: 'ethan.carter@techpro.com',
    expectedPhone: '(425) 881-8080',
    expectedCompany: 'Microsoft',
    expectedDesignation: 'Principal Software Engineer',
    expectedGradYear: '2014',
    expectedDegreeSubstring: 'Master',
    expectedSkills: ['C#', '.NET', 'Azure', 'TypeScript', 'React'],
    resumeText: `
Ethan Carter
Principal Software Engineer
ethan.carter@techpro.com | (425) 881-8080 | Redmond, WA
linkedin.com/in/ethancarter

WORK EXPERIENCE
Principal Software Engineer
Microsoft | Redmond, WA
July 2021 - Present
• Lead architect for Teams enterprise calling and video backend services
• Direct cross-functional group of 25 engineers

Senior Software Engineer
Microsoft
August 2017 - June 2021
• Scaled real-time messaging WebSocket infrastructure on Azure

Software Engineer II
Microsoft
June 2014 - July 2017
• Implemented client telemetry and diagnostics pipelines in C# and .NET

EDUCATION
Master of Science in Computer Science
Carnegie Mellon University
2012 - 2014

Bachelor of Science in Software Engineering
Purdue University
2008 - 2012

SKILLS
C#, .NET Core, TypeScript, React, Azure, Docker, Kubernetes, Microservices, SQL
    `
  },
  {
    id: 12,
    description: 'Minimalist Plain Text Resume (C++ Game Developer)',
    expectedName: 'Victor Vance',
    expectedEmail: 'victor.vance@gamedev.org',
    expectedPhone: '(310) 902-1144',
    expectedCompany: 'Epic Games',
    expectedDesignation: 'Lead Engine Programmer',
    expectedGradYear: '2016',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['C++', 'Python', 'Git', 'Linux'],
    resumeText: `
Victor Vance
victor.vance@gamedev.org
(310) 902-1144
Los Angeles, CA
https://github.com/vvance-games

EXPERIENCE
Lead Engine Programmer
Epic Games - Los Angeles, CA
2020 - Present
- Optimized Unreal Engine physics simulation pipeline
- Implemented real-time GPU memory management algorithms

Game Systems Engineer
Naughty Dog
2016 - 2020
- Developed collision detection and character animation controllers in C++

EDUCATION
Bachelor of Science in Computer Engineering
Georgia Institute of Technology
2012 - 2016

SKILLS
C++, C, Python, Assembly, Multi-threading, DirectX, Vulkan, Linux, Git
    `
  },
  {
    id: 13,
    description: 'Executive VP of Engineering (20+ yrs)',
    expectedName: 'Robert Sterling',
    expectedEmail: 'robert.sterling@execmail.com',
    expectedPhone: '(408) 555-8800',
    expectedCompany: 'Snowflake Inc',
    expectedDesignation: 'Vice President of Engineering',
    expectedGradYear: '2002',
    expectedDegreeSubstring: 'Master',
    expectedSkills: ['Agile', 'Cloud', 'Kubernetes', 'Go', 'Python'],
    resumeText: `
Robert Sterling
Vice President of Engineering
robert.sterling@execmail.com | (408) 555-8800 | San Jose, CA
linkedin.com/in/robertsterling-vp

EXECUTIVE SUMMARY
Seasoned Technology Executive with 22 years experience leading global engineering organizations.

EXPERIENCE
Vice President of Engineering
Snowflake Inc | San Mateo, CA
January 2020 - Present
• Scaled global engineering department from 120 to 650 engineers
• Managed $85M annual R&D budget and delivered mission-critical data cloud services

VP of Platform Engineering
Salesforce
March 2014 - December 2019
• Oversaw core platform compute infrastructure supporting 100K+ enterprise tenants

EDUCATION
Master of Science in Computer Science
University of Illinois Urbana-Champaign
2000 - 2002

Bachelor of Science in Electrical Engineering
Purdue University
1996 - 2000

KEY EXPERTISE
Engineering Leadership, Cloud Infrastructure, Go, Python, Kubernetes, Agile, M&A
    `
  },
  {
    id: 14,
    description: 'Healthcare Systems Analyst (Epic Systems, HIPAA)',
    expectedName: 'Jessica Martinez',
    expectedEmail: 'jessica.martinez@healthsys.net',
    expectedPhone: '(617) 492-7719',
    expectedCompany: 'Mass General Brigham',
    expectedDesignation: 'Lead Clinical Systems Analyst',
    expectedGradYear: '2017',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['SQL', 'Python', 'Tableau', 'Agile'],
    resumeText: `
Jessica Martinez
Lead Clinical Systems Analyst
jessica.martinez@healthsys.net | (617) 492-7719 | Boston, MA
linkedin.com/in/jessicamartinez-health

CAREER OBJECTIVE
Certified Epic Systems Clinical Analyst dedicated to optimizing patient EHR workflows.

WORK EXPERIENCE
Lead Clinical Systems Analyst
Mass General Brigham | Boston, MA
August 2020 - Present
• Directed enterprise deployment of Epic Cadence and Prelude across 14 hospital affiliates
• Monitored HIPAA compliance and integrated HL7/FHIR interfaces

Healthcare Data Analyst
Boston Children's Hospital
June 2017 - July 2020
• Automated patient readmission clinical dashboards using SQL and Tableau

EDUCATION
Bachelor of Science in Health Informatics
Boston University
2013 - 2017

SKILLS
Epic Systems, HL7, FHIR, HIPAA Compliance, SQL, Python, Tableau, Agile, Jira
    `
  },
  {
    id: 15,
    description: 'Non-Standard Headings ("Where I\'ve Been", "Tech Stack")',
    expectedName: 'Tariq Al-Mansoor',
    expectedEmail: 'tariq.almansoor@gulftech.ae',
    expectedPhone: '+971 50 123 4567',
    expectedCompany: 'Careem',
    expectedDesignation: 'Staff Backend Architect',
    expectedGradYear: '2016',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['Go', 'Python', 'Kafka', 'Redis', 'PostgreSQL'],
    resumeText: `
Tariq Al-Mansoor
Staff Backend Architect
tariq.almansoor@gulftech.ae | +971 50 123 4567 | Dubai, UAE
linkedin.com/in/tariqalmansoor

ABOUT ME
Passionate backend architect specializing in distributed high-concurrency systems.

WHERE I'VE WORKED
Staff Backend Architect
Careem | Dubai, UAE
April 2021 - Present
• Designed real-time ride dispatch matching engine in Go handling 50k transactions/sec
• Replaced legacy monolithic services with event-driven Kafka architecture

Senior Software Engineer
Noon.com
September 2016 - March 2021
• Scaled warehouse inventory management systems

ACADEMIC BACKGROUND
Bachelor of Science in Computer Engineering
American University of Sharjah
2012 - 2016

TECH STACK
Golang, Python, Kafka, Redis, PostgreSQL, Docker, Kubernetes, Microservices
    `
  },
  {
    id: 16,
    description: 'European Developer (Berlin, Germany, Go, Docker)',
    expectedName: 'Lukas Weber',
    expectedEmail: 'lukas.weber@berlintech.de',
    expectedPhone: '+49 30 1234567',
    expectedCompany: 'Zalando SE',
    expectedDesignation: 'Senior Cloud Engineer',
    expectedGradYear: '2018',
    expectedDegreeSubstring: 'Master',
    expectedSkills: ['Go', 'Docker', 'Kubernetes', 'AWS', 'PostgreSQL'],
    resumeText: `
Lukas Weber
Senior Cloud Engineer
lukas.weber@berlintech.de | +49 30 1234567 | Berlin, Germany
https://github.com/lukasweber-de

SUMMARY
Cloud Infrastructure Engineer with deep expertise in Kubernetes operators and Go microservices.

PROFESSIONAL EXPERIENCE
Senior Cloud Engineer
Zalando SE | Berlin, Germany
October 2021 - Present
• Maintained multi-tenant Kubernetes clusters running 2,000+ microservices on AWS
• Reduced container image build and rollout latency by 45%

DevOps Engineer
Delivery Hero
November 2018 - September 2021
• Automated global order processing infrastructure deployment with Terraform

EDUCATION
Master of Science in Informatics
Technical University of Munich
2016 - 2018

Bachelor of Science in Computer Science
Humboldt University of Berlin
2013 - 2016

SKILLS
Go, Docker, Kubernetes, Terraform, AWS, PostgreSQL, Prometheus, Grafana, Linux, Git
    `
  },
  {
    id: 17,
    description: 'Dense 4-Job History Resume with distinct date intervals',
    expectedName: 'Kavita Patel',
    expectedEmail: 'kavita.patel@dataeng.net',
    expectedPhone: '+91 99887 76655',
    expectedCompany: 'Amazon India',
    expectedDesignation: 'Senior Data Engineer',
    expectedGradYear: '2015',
    expectedDegreeSubstring: 'B.E',
    expectedSkills: ['Python', 'SQL', 'Spark', 'AWS', 'Kafka'],
    resumeText: `
Kavita Patel
Senior Data Engineer
kavita.patel@dataeng.net | +91 99887 76655 | Hyderabad, India
linkedin.com/in/kavitapatel-data

PROFESSIONAL EXPERIENCE
Senior Data Engineer
Amazon India | Hyderabad, India
August 2022 - Present
• Built real-time customer behavioral event streaming pipeline using Kafka and Spark
• Automated data lake ingestion for 25TB daily clickstream data on AWS S3

Data Engineer
Swiggy
January 2020 - July 2022
• Developed delivery partner routing analytics pipelines in PySpark and Snowflake

Big Data Engineer
Mu Sigma
June 2017 - December 2019
• Created ETL batch jobs in Python and SQL for retail clients

Software Trainee
Cognizant
July 2015 - May 2017
• Maintained enterprise data warehouse reporting queries

EDUCATION
B.E. in Information Science and Engineering
Osmania University
2011 - 2015

SKILLS
Python, SQL, Apache Spark, Kafka, AWS, Snowflake, Airflow, Hadoop, PostgreSQL
    `
  },
  {
    id: 18,
    description: 'Multilingual Developer (English, Spanish, Hindi)',
    expectedName: 'Mateo Hernandez',
    expectedEmail: 'mateo.hernandez@globaldev.io',
    expectedPhone: '+1 (786) 332-9018',
    expectedCompany: 'Shopify',
    expectedDesignation: 'Staff Frontend Engineer',
    expectedGradYear: '2017',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['React', 'TypeScript', 'GraphQL', 'Next.js', 'Tailwind'],
    resumeText: `
Mateo Hernandez
Staff Frontend Engineer
mateo.hernandez@globaldev.io | +1 (786) 332-9018 | Miami, FL
https://github.com/mateo-dev

SUMMARY
Frontend Architect specialized in internationalized, high-conversion e-commerce web applications.

WORK EXPERIENCE
Staff Frontend Engineer
Shopify | Miami, FL
May 2021 - Present
• Led frontend architecture for global merchant checkout handling $8B in annual GMV
• Spearheaded accessibility and internationalization across 28 global locales

Frontend Developer
Chewy
June 2017 - April 2021
• Built dynamic product catalog search and filter components in React and Next.js

EDUCATION
Bachelor of Science in Information Technology
Florida International University
2013 - 2017

LANGUAGES
English (Fluent), Spanish (Native), French (Intermediate)

SKILLS
React, TypeScript, Next.js, GraphQL, Redux, Tailwind CSS, Jest, Webpack, Git
    `
  },
  {
    id: 19,
    description: 'Financial Software Engineer (Goldman Sachs, Java)',
    expectedName: 'Daniel Chen',
    expectedEmail: 'daniel.chen@fintech-ny.com',
    expectedPhone: '(212) 890-4411',
    expectedCompany: 'Goldman Sachs',
    expectedDesignation: 'Vice President - Quantitative Developer',
    expectedGradYear: '2016',
    expectedDegreeSubstring: 'Master',
    expectedSkills: ['Java', 'Spring', 'Python', 'SQL', 'Docker'],
    resumeText: `
Daniel Chen
Vice President - Quantitative Developer
daniel.chen@fintech-ny.com | (212) 890-4411 | New York, NY
linkedin.com/in/danielchen-quant

PROFESSIONAL EXPERIENCE
Vice President - Quantitative Developer
Goldman Sachs | New York, NY
January 2020 - Present
• Lead developer for low-latency equity options pricing engines in Java 21
• Reduced tick-to-trade algorithmic latency from 45 microseconds to 12 microseconds

Quantitative Developer
Morgan Stanley
July 2016 - December 2019
• Engineered algorithmic order routing systems using Spring Boot and Kafka

EDUCATION
Master of Science in Computational Finance
Carnegie Mellon University
2014 - 2016

Bachelor of Science in Computer Science and Applied Mathematics
Cornell University
2010 - 2014

TECHNICAL SKILLS
Java, Spring Boot, Python, C++, SQL, Kafka, Docker, Linux, Low Latency Trading
    `
  },
  {
    id: 20,
    description: 'Noisy / OCR-style Scanned Text Format',
    expectedName: 'Priya Sundaram',
    expectedEmail: 'priya.sundaram@techfirm.com',
    expectedPhone: '+91 98201 12345',
    expectedCompany: 'Tata Consultancy Services',
    expectedDesignation: 'Senior Java Developer',
    expectedGradYear: '2019',
    expectedDegreeSubstring: 'Bachelor',
    expectedSkills: ['Java', 'Spring', 'SQL', 'Hibernate', 'REST'],
    resumeText: `
PRIYA SUNDARAM
Senior Java Developer
priya.sundaram@techfirm.com
Contact: +91 98201 12345
Location: Mumbai, Maharashtra, India
LinkedIn: https://linkedin.com/in/priyasundaram

CAREER OBJECTIVE:
Experienced Senior Java Developer with 5+ years experience building enterprise microservices.

PROFESSIONAL EXPERIENCE:
Senior Java Developer
Tata Consultancy Services | Mumbai, India
August 2021 to Present
- Developed RESTful APIs for UK banking client using Spring Boot and Microservices
- Handled Oracle database optimization and SQL query tuning

Java Software Engineer
L&T Infotech
July 2019 to July 2021
- Created backend services using Java 8, Spring MVC, and Hibernate

EDUCATIONAL QUALIFICATIONS:
Bachelor of Engineering in Information Technology
University of Mumbai
Passing Year: 2019

TECHNICAL SKILLS:
Java, J2EE, Spring Boot, Hibernate, REST, Microservices, Oracle, SQL, Git, Maven
    `
  }
];

export async function runBenchmark() {
  console.log('========================================================================');
  console.log('      PLACIFY CRM LOCAL HYBRID RESUME PARSER BENCHMARK (20 RESUMES)    ');
  console.log('========================================================================\n');

  let totalNamesCorrect = 0;
  let totalEmailsCorrect = 0;
  let totalPhonesCorrect = 0;
  let totalCompaniesCorrect = 0;
  let totalDesignationsCorrect = 0;
  let totalGradYearsCorrect = 0;
  let totalDegreesCorrect = 0;
  let totalSkillsFound = 0;
  let totalExpectedSkills = 0;
  let totalLatenciesMs = 0;
  let totalParsedWithoutGemini = 0;
  let totalRequiringGemini = 0;

  const results: Array<{
    id: number;
    description: string;
    latencyMs: number;
    overallConfidence: number;
    status: string;
    scores: Record<string, boolean>;
  }> = [];

  for (const item of BENCHMARK_RESUMES) {
    const startTime = performance.now();
    const parsed: LocalParsedResume = parseResumeLocally(item.resumeText);
    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
    totalLatenciesMs += latencyMs;

    // Field-level checks
    const nameMatch = parsed.full_name.toLowerCase().includes(item.expectedName.toLowerCase()) ||
                      item.expectedName.toLowerCase().includes(parsed.full_name.toLowerCase());
    const emailMatch = parsed.email.toLowerCase() === item.expectedEmail.toLowerCase();
    
    // Normalize phone numbers for comparison
    const normParsedPhone = parsed.phone.replace(/[\s().-]/g, '');
    const normExpPhone = item.expectedPhone.replace(/[\s().-]/g, '');
    const phoneMatch = normParsedPhone.includes(normExpPhone.slice(-8)) || normExpPhone.includes(normParsedPhone.slice(-8));

    const companyMatch = parsed.current_company.toLowerCase().includes(item.expectedCompany.toLowerCase()) ||
                         item.expectedCompany.toLowerCase().includes(parsed.current_company.toLowerCase());
    
    const designationMatch = parsed.current_designation.toLowerCase().includes(item.expectedDesignation.toLowerCase()) ||
                            item.expectedDesignation.toLowerCase().includes(parsed.current_designation.toLowerCase()) ||
                            parsed.job_interest.toLowerCase().includes(item.expectedDesignation.toLowerCase());

    const gradYearMatch = !item.expectedGradYear || parsed.graduation_year.includes(item.expectedGradYear);
    const degreeMatch = !item.expectedDegreeSubstring || parsed.degree.toLowerCase().includes(item.expectedDegreeSubstring.toLowerCase()) ||
                        parsed.education.toLowerCase().includes(item.expectedDegreeSubstring.toLowerCase());

    // Skills check
    let skillsMatched = 0;
    for (const expSkill of item.expectedSkills) {
      if (parsed.skills.toLowerCase().includes(expSkill.toLowerCase())) {
        skillsMatched++;
      }
    }
    totalSkillsFound += skillsMatched;
    totalExpectedSkills += item.expectedSkills.length;

    if (nameMatch) totalNamesCorrect++;
    if (emailMatch) totalEmailsCorrect++;
    if (phoneMatch) totalPhonesCorrect++;
    if (companyMatch) totalCompaniesCorrect++;
    if (designationMatch) totalDesignationsCorrect++;
    if (gradYearMatch) totalGradYearsCorrect++;
    if (degreeMatch) totalDegreesCorrect++;

    // Decision: If confidence >= 0.65 AND has Name AND (Email or Phone), parsed without Gemini
    const parsedLocally = parsed.confidence.overall >= 0.65 && Boolean(parsed.full_name && (parsed.email || parsed.phone));
    if (parsedLocally) {
      totalParsedWithoutGemini++;
    } else {
      totalRequiringGemini++;
    }

    results.push({
      id: item.id,
      description: item.description,
      latencyMs,
      overallConfidence: parsed.confidence.overall,
      status: parsedLocally ? 'LOCAL (Zero Cost)' : 'REQUIRES GEMINI FALLBACK',
      scores: {
        Name: nameMatch,
        Email: emailMatch,
        Phone: phoneMatch,
        Company: companyMatch,
        Designation: designationMatch,
        GradYear: gradYearMatch,
        Degree: degreeMatch,
        Skills: skillsMatched === item.expectedSkills.length
      }
    });

    console.log(`[#${item.id.toString().padStart(2, '0')}] ${item.description}`);
    console.log(`     Confidence: ${(parsed.confidence.overall * 100).toFixed(0)}% | Latency: ${latencyMs}ms | Route: ${parsedLocally ? '✅ LOCAL' : '⚠️ GEMINI FALLBACK'}`);
    console.log(`     Extracted: "${parsed.full_name}" | "${parsed.email}" | "${parsed.phone}"`);
    console.log(`     Work: ${parsed.current_designation || 'None'} at ${parsed.current_company || 'None'} (${parsed.experience_years || 'N/A'})`);
    console.log(`     Edu: ${parsed.degree || 'None'} | ${parsed.university || 'None'} (${parsed.graduation_year || 'N/A'})`);
    console.log(`     Skills: ${parsed.skills.split(', ').slice(0, 5).join(', ')}... (${parsed.skills.split(', ').filter(Boolean).length} total)\n`);
  }

  const N = BENCHMARK_RESUMES.length;
  const avgLatency = Math.round((totalLatenciesMs / N) * 100) / 100;
  const nameAcc = Math.round((totalNamesCorrect / N) * 100);
  const emailAcc = Math.round((totalEmailsCorrect / N) * 100);
  const phoneAcc = Math.round((totalPhonesCorrect / N) * 100);
  const companyAcc = Math.round((totalCompaniesCorrect / N) * 100);
  const desigAcc = Math.round((totalDesignationsCorrect / N) * 100);
  const gradYearAcc = Math.round((totalGradYearsCorrect / N) * 100);
  const degreeAcc = Math.round((totalDegreesCorrect / N) * 100);
  const skillsAcc = Math.round((totalSkillsFound / totalExpectedSkills) * 100);
  const localPercent = Math.round((totalParsedWithoutGemini / N) * 100);
  const geminiPercent = Math.round((totalRequiringGemini / N) * 100);

  console.log('========================================================================');
  console.log('                     FINAL BENCHMARK SCORECARD                          ');
  console.log('========================================================================');
  console.log(`Total Resumes Evaluated:            ${N}`);
  console.log(`Average Processing Latency:         ${avgLatency} ms (vs ~3,500 ms for Gemini)`);
  console.log(`Parsed Without Gemini ($0 Cost):     ${totalParsedWithoutGemini} / ${N} (${localPercent}%)`);
  console.log(`Requiring Gemini Fallback:          ${totalRequiringGemini} / ${N} (${geminiPercent}%)`);
  console.log('------------------------------------------------------------------------');
  console.log(`Name Accuracy:                      ${nameAcc}% (${totalNamesCorrect}/${N})`);
  console.log(`Email Accuracy:                     ${emailAcc}% (${totalEmailsCorrect}/${N})`);
  console.log(`Phone Accuracy:                     ${phoneAcc}% (${totalPhonesCorrect}/${N})`);
  console.log(`Company Accuracy:                   ${companyAcc}% (${totalCompaniesCorrect}/${N})`);
  console.log(`Designation Accuracy:               ${desigAcc}% (${totalDesignationsCorrect}/${N})`);
  console.log(`Education/Degree Accuracy:          ${degreeAcc}% (${totalDegreesCorrect}/${N})`);
  console.log(`Graduation Year Accuracy:           ${gradYearAcc}% (${totalGradYearsCorrect}/${N})`);
  console.log(`Skills Detection Accuracy:          ${skillsAcc}% (${totalSkillsFound}/${totalExpectedSkills})`);
  console.log('========================================================================\n');

  return {
    N,
    avgLatency,
    localPercent,
    geminiPercent,
    nameAcc,
    emailAcc,
    phoneAcc,
    companyAcc,
    desigAcc,
    degreeAcc,
    gradYearAcc,
    skillsAcc,
    results
  };
}

// Execute if run directly
runBenchmark().catch(console.error);
