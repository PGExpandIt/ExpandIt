import React from 'react';
import Image from 'next/image';

interface CommonStyles {
    container: string;
}

const COMMON_STYLES: CommonStyles = {
    container: "max-w-[850px] w-full",
};

const Header = () => (
    <header className={`flex items-center justify-center mb-12 ${COMMON_STYLES.container}`}>
        <Image src="/logo.png" alt="ExpandIt logo" width={120} height={120} className="mr-4" priority />
        <div>
            <h1 className="text-4xl font-bold text-white">Piotr Gajownik - ExpandIt</h1>
            <p className="text-lg mt-2 text-gray-200 text-center">
                A better quality starts now.
            </p>
        </div>
    </header>
);

export default Header;