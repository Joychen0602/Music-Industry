# Music Industry Transformation

## Description

This project presents an interactive data storytelling website that explores the evolution of the music industry from the 1970s to the present. Using historical revenue data from the Recording Industry Association of America (RIAA), the visualization demonstrates how different music formats-including vinyl records, cassette tapes, compact discs (CDs), digital downloads, and streaming services—rise and declined over time.

The website follows a Martini Glass storytelling structure. The first part guides users through key stages of the industry's transformation, including the Vinyl & Tape Era, the CD Revolution, the Digital Disruption period, and the rise of Streaming Dominance. The final section provides an interactive exploration dashboard that allows users to compare revenue trends across multiple music formats and revisit major transitions in music consumption.

### Repository Structure

```text
Music-Industry/
├── index.html              # Main webpage
├── style.css               # Website styling
├── script.js               # Visualization and interaction logic
├── music_data.csv          # Music industry revenue dataset
└── README.md               # Project documentation
```

## Installation

### Prerequisites

The project is a client-side web application built with HTML, CSS, JavaScript, and D3.js. No additional software installation is required beyond the web browser.

### Clone the Repository

```bash
git clone https://github.com/Joychen0602/Music-Industry.git
cd Music-Industry
```

### Dataset

The repository includes the processed music revenue dataset (`music_data.csv`). No additional dataset download or preprocessing is required.

## Execution

### Option 1: Local Web Server (Recommended)

Using Python:

```bash
python3 -m http.server 8000
```

Then navigate to:

```text
http://localhost:8000
```

in a web browser.

### Option 2: Using Visual Studio Code

Install the Live Server extension and open `index.html` using Live Server.

1. Install the **Live Server** extension:
  - Click the **Extensions** icon in the left sidebar.
  - Search for **"Live Server"**.
  - Install the extension

2. Right-click the HTML file and select: Open with Live Serve
