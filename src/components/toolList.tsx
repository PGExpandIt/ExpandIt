"use client";

interface ToolItem {
    id: number;
    name: string;
    img: string;
}


const items: ToolItem[] = [
    {id: 1, name: "Selenium WebDriver", img: "https://upload.wikimedia.org/wikipedia/commons/d/d5/Selenium_Logo.png"},
    {id: 2, name: "Playwright", img: "https://playwright.dev/img/playwright-logo.svg"},
    {id: 3, name: "Appium", img: "https://appium.io/docs/en/latest/assets/images/appium-logo.png"},
    {id: 4, name: "Protractor", img: "https://www.protractortest.org/img/favicon.ico"},
    {id: 5, name: "Cypress", img: "https://www.cypress.io/favicon.ico"},
    {id: 6, name: "Puppeteer", img: "https://pptr.dev/img/favicon.ico"},
    {
        id: 7,
        name: "Test Complete",
        img: "https://deitry.gallerycdn.vsassets.io/extensions/deitry/vscode-testcomplete/0.0.7/1646822796147/Microsoft.VisualStudio.Services.Icons.Default"
    },
    {id: 8, name: "SpecFlow", img: "https://gasparnagy.com/wp-content/uploads/2019/04/specflow-icon-new.png"},
    {id: 9, name: "Cucumber", img: "https://cucumber.io/img/logo.svg"},
    {id: 10, name: "Cucumber Studio", img: "https://cucumber.io/img/logo.svg"},
    {
        id: 11,
        name: "Jira",
        img: "https://images.icon-icons.com/3053/PNG/512/jira_cloud_macos_bigsur_icon_190051.png"
    },
    {id: 12, name: "Xray", img: "https://docs.getxray.app/download/attachments/27536922/Logo-Xray.png?version=2&modificationDate=1540404968127&api=v2"},
    {id: 13, name: "Jenkins", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Jenkins_logo.svg/1200px-Jenkins_logo.svg.png"},
    {id: 14, name: "GitHub", img: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"},

    {id: 15, name: "MS Azure", img: "https://bravocg.com/wp-content/uploads/2022/06/logo-microsoft-cloud-azure-png-480x270.webp"},
];


const ToolsList = () => (
    <ul className="mt-4 space-y-2 text-white mx-8 grid grid-cols-3 gap-4">
        {items.map(({ id, name, img }) => (
            <li key={id} className="flex flex-col items-center justify-center text-center">
                <img src={img} alt={`${name} logo`} width={32} height={32} className="mb-2" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.png'; }} />
                <span className="text-sm text-white">{name}</span>
            </li>
        ))}
    </ul>
);


export default ToolsList;